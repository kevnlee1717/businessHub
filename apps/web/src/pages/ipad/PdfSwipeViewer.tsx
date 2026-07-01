import { ActionIcon, Box, Center, Loader, Modal, Progress, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

type PdfSwipeViewerProps = {
  url: string;
  title: string;
  opened: boolean;
  onClose: () => void;
  orientation?: "landscape" | "portrait";
};

// 图片渲染分辨率上限:JPEG 图 dpr=2 已够清晰,避免 3x 设备生成过大图片。
const MAX_DPR = 2;

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 渲染好的整页图片持久化到设备(Cache API),下次打开同一 PDF 直接取用、跳过 pdf.js 渲染。
const PAGE_CACHE_NAME = "ipad-pdf-pages-v1";

// 缓存键:同源合成 URL,按 PDF 地址 + 渲染宽度分桶 + 页码。宽度分桶避免细小尺寸差异导致重渲。
function pageCacheKey(pdfUrl: string, width: number, pageIndex: number) {
  const bucket = Math.round(width / 20) * 20;
  return `${window.location.origin}/__pdfpage/v1/${encodeURIComponent(pdfUrl)}/${bucket}/${pageIndex}.jpg`;
}

async function readCachedPage(key: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(PAGE_CACHE_NAME);
    const response = await cache.match(key);
    return response ? await response.blob() : null;
  } catch {
    return null;
  }
}

async function writeCachedPage(key: string, blob: Blob): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(PAGE_CACHE_NAME);
    await cache.put(key, new Response(blob, { headers: { "Content-Type": "image/jpeg" } }));
  } catch {
    // 配额不足 / 隐私模式等:忽略,下次再渲。
  }
}

export function PdfSwipeViewer({ url, title, opened, onClose, orientation = "landscape" }: PdfSwipeViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const urlRef = useRef(url); // 当前 PDF 地址,供渲染泵拼缓存键

  // 复用的离屏 canvas:只用来把 PDF 页画出来再转成图片,画完即丢,不常驻 DOM。
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // 各页已渲染好的图片 URL(与 pageImages state 同步的 ref,供渲染泵读取,避免闭包过期)。
  const pageUrlsRef = useRef<Array<string | null>>([]);
  const renderWidthRef = useRef(0); // 图片当前渲染所用的 CSS 宽度
  const renderingRef = useRef(false); // 是否有一页正在渲染(串行,防止并发抢 canvas)
  const currentIndexRef = useRef(0); // 最新当前页,用于渲染优先级
  const tokenRef = useRef(0); // 代际令牌:换文档/换尺寸时 +1,让在途渲染作废

  const [numPages, setNumPages] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pageImages, setPageImages] = useState<Array<string | null>>([]);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);

  const revokeAllUrls = useCallback(() => {
    for (const objectUrl of pageUrlsRef.current) {
      if (objectUrl && objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    }
    pageUrlsRef.current = [];
  }, []);

  const updateContainerWidth = useCallback(() => {
    const nextWidth = scrollRef.current?.clientWidth ?? 0;
    setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  const updateCurrentIndex = useCallback(() => {
    const node = scrollRef.current;
    if (!node || !node.clientWidth) return;
    const nextIndex = Math.max(0, Math.min(numPages - 1, Math.round(node.scrollLeft / node.clientWidth)));
    setCurrentIndex((current) => (current === nextIndex ? current : nextIndex));
  }, [numPages]);

  // 渲染泵:每次挑一页(按"当前页向两边"的优先级、且尚无图片的)渲染成 JPEG 图片,
  // 串行进行、完成后自动继续下一页,直到所有页都变成现成图片。
  const pumpRender = useCallback(async () => {
    if (renderingRef.current) return;
    const pdfDocument = documentRef.current;
    const total = pdfDocument?.numPages ?? 0;
    const width = renderWidthRef.current;
    if (!pdfDocument || total === 0 || width <= 0) return;

    // 选下一个待渲染页:从当前页向两边扩散,优先把用户即将看的页画出来。
    const center = Math.max(0, Math.min(total - 1, currentIndexRef.current));
    let target = -1;
    const consider = (index: number) => {
      if (target < 0 && index >= 0 && index < total && !pageUrlsRef.current[index]) target = index;
    };
    consider(center);
    for (let d = 1; d < total && target < 0; d += 1) {
      consider(center + d);
      consider(center - d);
    }
    if (target < 0) return; // 全部渲染完毕

    renderingRef.current = true;
    const token = tokenRef.current;
    const cacheKey = pageCacheKey(urlRef.current, width, target);
    const publish = (objectUrl: string) => {
      pageUrlsRef.current[target] = objectUrl;
      setPageImages((prev) => {
        const next = prev.slice();
        next[target] = objectUrl;
        return next;
      });
    };
    try {
      // 1) 先查本地持久缓存 —— 命中直接显示,跳过 pdf.js 渲染(重复打开秒开)
      const cachedBlob = await readCachedPage(cacheKey);
      if (token !== tokenRef.current) return;
      if (cachedBlob) {
        publish(URL.createObjectURL(cachedBlob));
        return;
      }

      // 2) 未命中 → pdf.js 渲染成 JPEG,并持久化到设备供下次秒开
      const page = await pdfDocument.getPage(target + 1);
      if (token !== tokenRef.current) return;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width * dpr) / base.width });

      let canvas = renderCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        renderCanvasRef.current = canvas;
      }
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      // JPEG 无透明通道,先铺白底,避免透明区域转成黑色。
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, canvas, viewport }).promise;
      if (token !== tokenRef.current) return;

      const blob = await new Promise<Blob | null>((resolve) => {
        if (canvas && typeof canvas.toBlob === "function") canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
        else resolve(null);
      });
      if (token !== tokenRef.current) {
        // 已作废:丢弃这张图,由新一代重画
        return;
      }

      if (blob) {
        publish(URL.createObjectURL(blob));
        void writeCachedPage(cacheKey, blob); // 后台持久化,不阻塞显示
      } else {
        publish(canvas.toDataURL("image/jpeg", 0.92));
      }
    } catch {
      // 渲染被令牌作废/文档已销毁等:忽略,交给下一代重画
    } finally {
      renderingRef.current = false;
      if (token === tokenRef.current) void pumpRender(); // 继续渲染剩余页
    }
  }, []);

  // 加载文档(整包下载,便于 service worker 缓存 + 一次拿到全部页字节)
  useEffect(() => {
    if (!opened || !url) {
      setNumPages(0);
      setCurrentIndex(0);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    urlRef.current = url;
    tokenRef.current += 1;
    renderingRef.current = false;
    renderWidthRef.current = 0;
    revokeAllUrls();

    setLoading(true);
    setError(false);
    setProgress(null);
    setNumPages(0);
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setPageImages([]);

    void documentRef.current?.cleanup();
    documentRef.current = null;
    loadingTaskRef.current?.destroy();
    // 整包下载(不走 HTTP Range 分块):
    // 1) 请求变成普通 GET(200),service worker 才能 cache-first 缓存到设备(206 无法被 Cache API 缓存)
    // 2) 下载完成后所有页字节都在内存,渲染任一页都无需再等网络
    const loadingTask = pdfjsLib.getDocument({
      url,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
    });
    loadingTaskRef.current = loadingTask;

    loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (!cancelled) setProgress({ loaded, total: total || 0 });
    };

    loadingTask.promise
      .then((pdfDocument) => {
        if (cancelled) {
          pdfDocument.loadingTask.destroy();
          return;
        }
        documentRef.current = pdfDocument;
        pageUrlsRef.current = new Array(pdfDocument.numPages).fill(null);
        setPageImages(new Array(pdfDocument.numPages).fill(null));
        setNumPages(pdfDocument.numPages);
        setLoading(false);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ left: 0 });
          updateContainerWidth();
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
      tokenRef.current += 1;
      loadingTask.destroy();
      if (loadingTaskRef.current === loadingTask) {
        loadingTaskRef.current = null;
      }
      void documentRef.current?.cleanup();
      documentRef.current = null;
      revokeAllUrls();
    };
  }, [opened, revokeAllUrls, updateContainerWidth, url]);

  // 跟踪容器宽度(旋转/尺寸变化)
  useEffect(() => {
    if (!opened) return;

    updateContainerWidth();
    const node = scrollRef.current;
    const resizeObserver =
      node && "ResizeObserver" in window
        ? new ResizeObserver(() => {
            updateContainerWidth();
          })
        : null;
    if (node && resizeObserver) resizeObserver.observe(node);

    window.addEventListener("resize", updateContainerWidth);
    window.addEventListener("orientationchange", updateContainerWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateContainerWidth);
      window.removeEventListener("orientationchange", updateContainerWidth);
    };
  }, [opened, updateContainerWidth]);

  // 竖版宣传册锁定竖屏浏览:iOS Safari 无法真正锁旋转,横屏时改为提示转回竖屏。
  useEffect(() => {
    if (!opened) return;
    const mq = window.matchMedia("(orientation: landscape)");
    const update = () => setIsLandscape(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [opened]);

  // 文档就绪 / 宽度变化 → 启动(或按新尺寸重启)后台渲染
  useEffect(() => {
    if (!opened || loading || error || numPages === 0 || containerWidth <= 0) return;

    if (renderWidthRef.current === 0) {
      renderWidthRef.current = containerWidth;
    } else if (Math.abs(renderWidthRef.current - containerWidth) > 40) {
      // 宽度明显变化(如横竖屏切换):作废旧图,按新尺寸重画
      tokenRef.current += 1;
      renderingRef.current = false;
      revokeAllUrls();
      renderWidthRef.current = containerWidth;
      pageUrlsRef.current = new Array(numPages).fill(null);
      setPageImages(new Array(numPages).fill(null));
    }
    void pumpRender();
  }, [containerWidth, error, loading, numPages, opened, pumpRender, revokeAllUrls]);

  // 当前页变化 → 让渲染泵优先补齐当前页附近
  useEffect(() => {
    currentIndexRef.current = currentIndex;
    void pumpRender();
  }, [currentIndex, pumpRender]);

  // 设备当前朝向与该资料设定的浏览朝向不一致 → 提示转屏(iOS 无法真正锁旋转)
  const orientationMismatch = orientation === "portrait" ? isLandscape : !isLandscape;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton={false}
      padding={0}
      styles={{
        body: { background: "#111", height: "100vh", overflow: "hidden" },
        content: { background: "#111" },
      }}
    >
      <Box pos="relative" h="100vh" bg="#111" c="white" style={{ overflow: "hidden" }}>
        {title ? (
          <Text
            pos="fixed"
            top={22}
            left={24}
            maw="calc(100vw - 112px)"
            fz={16}
            fw={600}
            truncate
            style={{ zIndex: 10, textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}
          >
            {title}
          </Text>
        ) : null}

        <ActionIcon
          aria-label="关闭"
          variant="filled"
          color="gray"
          radius="xl"
          size={58}
          pos="fixed"
          top={16}
          right={18}
          style={{ zIndex: 11, background: "rgba(0, 0, 0, 0.72)" }}
          onClick={onClose}
        >
          <Text fz={38} lh={1} c="white">
            ×
          </Text>
        </ActionIcon>

        {loading ? (
          <Center h="100%" px={40}>
            {progress && progress.total > 0 ? (
              <Stack gap={14} w="100%" maw={360} align="center">
                <Text fz={16} fw={600} c="white">
                  正在加载 PDF… {Math.floor((progress.loaded / progress.total) * 100)}%
                </Text>
                <Progress
                  value={(progress.loaded / progress.total) * 100}
                  w="100%"
                  size="lg"
                  radius="xl"
                  color="teal"
                  transitionDuration={200}
                />
                <Text fz={13} c="gray.5">
                  {formatMB(progress.loaded)} / {formatMB(progress.total)}
                </Text>
              </Stack>
            ) : (
              <Stack gap={14} align="center">
                <Loader color="gray" size="lg" />
                <Text fz={13} c="gray.5">
                  {progress ? `已加载 ${formatMB(progress.loaded)}` : "正在加载 PDF…"}
                </Text>
              </Stack>
            )}
          </Center>
        ) : error ? (
          <Center h="100%">
            <Text fz={22} c="white">
              无法加载 PDF
            </Text>
          </Center>
        ) : (
          <Box
            ref={scrollRef}
            onScroll={updateCurrentIndex}
            style={{
              display: "flex",
              height: "100%",
              width: "100%",
              overflowX: "auto",
              overflowY: "hidden",
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {Array.from({ length: numPages }, (_, pageIndex) => (
              <Box
                key={pageIndex}
                style={{
                  flex: "0 0 100%",
                  width: "100%",
                  height: "100%",
                  scrollSnapAlign: "center",
                  // 每页图片正好铺满整屏(不管比例):无上下溢出,避免纵向滚动抢走左右翻页手势
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {pageImages[pageIndex] ? (
                  <img
                    src={pageImages[pageIndex] as string}
                    alt={`第 ${pageIndex + 1} 页`}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      objectFit: "fill",
                    }}
                  />
                ) : (
                  <Center pos="absolute" inset={0}>
                    <Loader color="gray" />
                  </Center>
                )}
              </Box>
            ))}
          </Box>
        )}

        {orientationMismatch ? (
          <Center pos="fixed" inset={0} bg="#111" px={40} style={{ zIndex: 9, flexDirection: "column", gap: 18 }}>
            <Text fz={64} lh={1}>
              📱
            </Text>
            <Text fz={22} fw={700} c="white" ta="center">
              {orientation === "portrait" ? "请将 iPad 竖过来查看" : "请将 iPad 横过来查看"}
            </Text>
            <Text fz={15} c="gray.5" ta="center">
              {orientation === "portrait"
                ? "这份资料为竖版,竖屏浏览铺满全屏、效果最佳"
                : "这份资料为横版,横屏浏览铺满全屏、效果最佳"}
            </Text>
          </Center>
        ) : null}

        {numPages > 0 && !loading && !error && !orientationMismatch ? (
          <Box
            pos="fixed"
            bottom={22}
            left="50%"
            px="md"
            py={7}
            style={{
              zIndex: 10,
              transform: "translateX(-50%)",
              borderRadius: 999,
              background: "rgba(0, 0, 0, 0.72)",
            }}
          >
            <Text fz={16} fw={700} c="white">
              {currentIndex + 1} / {numPages}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Modal>
  );
}
