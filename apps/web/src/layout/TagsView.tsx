import { useNavigate } from "react-router-dom";

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
}

/** element-admin 风格的多标签页导航 */
export function TagsView({ views, activePath, affixPath = "/", onClose }: TagsViewProps) {
  const navigate = useNavigate();

  return (
    <div className="tags-view">
      {views.map((view) => {
        const isActive = view.path === activePath;
        const closable = view.path !== affixPath;
        return (
          <span
            key={view.path}
            className={isActive ? "tags-view-item active" : "tags-view-item"}
            onClick={() => navigate(view.path)}
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
    </div>
  );
}
