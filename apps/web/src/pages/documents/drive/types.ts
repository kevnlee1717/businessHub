import { type DriveNode } from "../../../api/drive";

export type DriveTreeNode = DriveNode & {
  children?: DriveTreeNode[];
};

export type DriveNodeAction = (node: DriveNode) => void;
