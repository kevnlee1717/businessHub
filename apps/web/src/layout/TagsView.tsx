import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export interface VisitedView {
  path: string;
  title: string;
}

interface TagsViewProps {
  views: VisitedView[];
  activePath: string;
  /** 不可关闭的固定标签路径(如首页/仪表盘) */
  affixPath?: string;
  onClose: (path: string) => void;
  onCloseOthers?: (path: string) => void;
  onCloseRight?: (path: string) => void;
  onCloseAll?: () => void;
}

interface ContextMenuState {
  top: number;
  left: number;
  path: string;
}

/** element-admin 风格的多标签页导航 */
export function TagsView({
  views,
  activePath,
  affixPath = "/",
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll
}: TagsViewProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击空白处 / 滚动 / Esc 关闭右键菜单
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function openMenu(event: React.MouseEvent, path: string) {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    // 菜单宽约 110px,贴近光标但不溢出右边界
    const maxLeft = (rect ? rect.right : window.innerWidth) - 120;
    setMenu({
      top: event.clientY + 4,
      left: Math.min(event.clientX, maxLeft),
      path
    });
  }

  const menuPath = menu?.path;
  const menuIdx = menuPath ? views.findIndex((v) => v.path === menuPath) : -1;
  const isAffix = menuPath === affixPath;
  // 右侧是否还有可关闭的标签
  const hasRight = menuIdx >= 0 && menuIdx < views.length - 1;

  return (
    <div className="tags-view" ref={containerRef}>
      {views.map((view) => {
        const isActive = view.path === activePath;
        const closable = view.path !== affixPath;
        return (
          <span
            key={view.path}
            className={isActive ? "tags-view-item active" : "tags-view-item"}
            onClick={() => navigate(view.path)}
            onContextMenu={(event) => openMenu(event, view.path)}
          >
            {isActive && <span className="tags-view-dot" />}
            {view.title}
            {closable && (
              <span
                className="tags-view-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(view.path);
                }}
              >
                ×
              </span>
            )}
          </span>
        );
      })}

      {menu && (
        <ul
          className="tags-view-contextmenu"
          style={{ top: menu.top, left: menu.left }}
          // 阻止菜单内的点击冒泡到 document 的关闭监听之前先执行命令
          onClick={(e) => e.stopPropagation()}
        >
          {!isAffix && (
            <li
              onClick={() => {
                onClose(menu.path);
                setMenu(null);
              }}
            >
              {t("tagsView.close", "关闭")}
            </li>
          )}
          <li
            onClick={() => {
              onCloseOthers?.(menu.path);
              setMenu(null);
            }}
          >
            {t("tagsView.closeOthers", "关闭其他")}
          </li>
          <li
            className={hasRight ? undefined : "is-disabled"}
            onClick={() => {
              if (!hasRight) return;
              onCloseRight?.(menu.path);
              setMenu(null);
            }}
          >
            {t("tagsView.closeRight", "关闭右侧")}
          </li>
          <li
            onClick={() => {
              onCloseAll?.();
              setMenu(null);
            }}
          >
            {t("tagsView.closeAll", "关闭全部")}
          </li>
        </ul>
      )}
    </div>
  );
}
