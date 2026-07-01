import { ActionIcon, Box, Center, Loader, Modal, Progress, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

type PdfSwipeViewerProps = {
  url: string;
  title: string;
  opened: boolean;
  onClose: () => void;
};

const MAX_DPR = 2.5;

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isRenderCancel(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

export function PdfSwipeViewer({ url, title, opened, onClose }: PdfSwipeViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTasksRef = useRef(new Map<number, RenderTask>());
  const renderedKeysRef = useRef(new Map<number, string>());
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [numPages, setNumPages] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set());
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  const cancelRenderTasks = useCallback(() => {
    for (const task of renderTasksRef.current.values()) {
      task.cancel();
    }
    renderTasksRef.current.clear();
  }, []);

  const resetRenderedPages = useCallback(() => {
    cancelRenderTasks();
    renderedKeysRef.current.clear();
    setRenderedPages(new Set());
  }, [cancelRenderTasks]);

  // 页离开视口足够远时释放它的 canvas 内存并清掉"已渲染"标记,
  // 这样再进入视口一定会重画 —— 根治 iOS 把屏外 canvas 清空后回来变黑屏。
  const clearPage = useCallback((pageIndex: number) => {
    renderTasksRef.current.get(pageIndex)?.cancel();
    renderTasksRef.current.delete(pageIndex);
    renderedKeysRef.current.delete(pageIndex);
    const canvas = canvasRefs.current[pageIndex];
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    setRenderedPages((current) => {
      if (!current.has(pageIndex)) return current;
      const next = new Set(current);
      next.delete(pageIndex);
      return next;
    });
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

  const renderPage = useCallback(
    async (pageIndex: number) => {
      const pdfDocument = documentRef.current;
      const canvas = canvasRefs.current[pageIndex];
      const cssWidth = scrollRef.current?.clientWidth ?? containerWidth;

      if (!pdfDocument || !canvas || cssWidth <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const renderKey = `${Math.round(cssWidth)}:${dpr}`;
      if (renderedKeysRef.current.get(pageIndex) === renderKey) return;

      renderTasksRef.current.get(pageIndex)?.cancel();
      renderedKeysRef.current.set(pageIndex, renderKey);
      setRenderedPages((current) => {
        const next = new Set(current);
        next.delete(pageIndex);
        return next;
      });

      try {
        const page = await pdfDocument.getPage(pageIndex + 1);
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = cssWidth / baseViewport.width;
        const cssViewport = page.getViewport({ scale: cssScale });
        const renderViewport = page.getViewport({ scale: cssScale * dpr });
        const context = canvas.getContext("2d");

        if (!context) return;

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        const task = page.render({ canvasContext: context, canvas, viewport: renderViewport });
        renderTasksRef.current.set(pageIndex, task);
        await task.promise;

        if (renderedKeysRef.current.get(pageIndex) === renderKey) {
          setRenderedPages((current) => {
            const next = new Set(current);
            next.add(pageIndex);
            return next;
          });
        }
      } catch (renderError) {
        if (!isRenderCancel(renderError)) {
          renderedKeysRef.current.delete(pageIndex);
        }
      } finally {
        renderTasksRef.current.delete(pageIndex);
      }
    },
    [containerWidth]
  );

  useEffect(() => {
    if (!opened || !url) {
      setNumPages(0);
      setCurrentIndex(0);
      setLoading(false);
      setError(false);
      resetRenderedPages();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setProgress(null);
    setNumPages(0);
    setCurrentIndex(0);
    resetRenderedPages();
    canvasRefs.current = [];
    slideRefs.current = [];

    void documentRef.current?.cleanup();
    documentRef.current = null;
    loadingTaskRef.current?.destroy();
    // 整包下载(不走 HTTP Range 分块):
    // 1) 请求变成普通 GET(200),service worker 才能 cache-first 缓存到设备(206 无法被 Cache API 缓存)
    // 2) 下载完成后所有页字节都在内存,翻页时 getPage 立即返回,不再因等网络出现整页黑屏
    const loadingTask = pdfjsLib.getDocument({
      url,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
    });
    loadingTaskRef.current = loadingTask;

    // 整包下载时 pdf.js 会持续回调下载进度(total 来自服务器 Content-Length)
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
      loadingTask.destroy();
      if (loadingTaskRef.current === loadingTask) {
        loadingTaskRef.current = null;
      }
      cancelRenderTasks();
      void documentRef.current?.cleanup();
      documentRef.current = null;
    };
  }, [cancelRenderTasks, opened, resetRenderedPages, updateContainerWidth, url]);

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

    if (node && resizeObserver) {
      resizeObserver.observe(node);
    }

    window.addEventListener("resize", updateContainerWidth);
    window.addEventListener("orientationchange", updateContainerWidth);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateContainerWidth);
      window.removeEventListener("orientationchange", updateContainerWidth);
    };
  }, [opened, updateContainerWidth]);

  // IntersectionObserver 驱动的移动渲染窗口:
  // - 页进入(含 rootMargin 提前量)→ 渲染;相邻页提前画好,正常翻页不黑屏
  // - 页离开足够远 → clearPage 释放 canvas,内存被限制在几页,iOS 不再乱清屏内的页
  // 尺寸/文档变化时(containerWidth 变)重建 observer 并清缓存键 → 可见页按新尺寸重画
  useEffect(() => {
    if (!opened || loading || error || numPages === 0 || containerWidth <= 0) return;
    const root = scrollRef.current;
    if (!root) return;

    if (typeof IntersectionObserver === "undefined") {
      // 兜底(极旧浏览器无 IO):一次性渲染全部页
      for (let pageIndex = 0; pageIndex < numPages; pageIndex += 1) {
        void renderPage(pageIndex);
      }
      return;
    }

    renderedKeysRef.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const raw = (entry.target as HTMLElement).dataset.pageIndex;
          const pageIndex = raw === undefined ? Number.NaN : Number(raw);
          if (Number.isNaN(pageIndex)) continue;
          if (entry.isIntersecting) {
            void renderPage(pageIndex);
          } else {
            clearPage(pageIndex);
          }
        }
      },
      // 横向 scroll-snap:视口左右各扩约一屏做提前量;threshold 稍大于 0 即触发
      { root, rootMargin: "0px 120% 0px 120%", threshold: 0.01 }
    );

    for (const node of slideRefs.current) {
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, [clearPage, containerWidth, error, loading, numPages, opened, renderPage]);

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
                ref={(node: HTMLDivElement | null) => {
                  slideRefs.current[pageIndex] = node;
                }}
                data-page-index={pageIndex}
                style={{
                  flex: "0 0 100%",
                  width: "100%",
                  height: "100%",
                  scrollSnapAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                {!renderedPages.has(pageIndex) ? (
                  <Center pos="absolute" inset={0}>
                    <Loader color="gray" />
                  </Center>
                ) : null}
                <canvas
                  ref={(node) => {
                    canvasRefs.current[pageIndex] = node;
                  }}
                  style={{ display: "block", maxWidth: "100%" }}
                />
              </Box>
            ))}
          </Box>
        )}

        {numPages > 0 && !loading && !error ? (
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
