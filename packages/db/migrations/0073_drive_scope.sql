ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS scope text;

-- 回填已有模块 root 的 scope(宣传册 drive 会隐藏这些 scope 非 null 的子树)
UPDATE drive_nodes SET scope = 'case'
  WHERE parent_id IS NULL AND scope IS NULL AND name IN ('EP案件', 'ICA案件', 'DP案件');
UPDATE drive_nodes SET scope = 'mlk'
  WHERE parent_id IS NULL AND scope IS NULL AND name = '陆老师厨房';
