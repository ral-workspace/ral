import type { SplitNode } from "../types/editor";

export function removeGroupFromTree(node: SplitNode, groupId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.groupId === groupId ? null : node;
  }
  const children = node.children
    .map((c) => removeGroupFromTree(c, groupId))
    .filter((c): c is SplitNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

export function findGroupIds(node: SplitNode): string[] {
  if (node.type === "leaf") return [node.groupId];
  return node.children.flatMap(findGroupIds);
}

export function insertSplit(
  node: SplitNode,
  targetGroupId: string,
  newGroupId: string,
  direction: "horizontal" | "vertical",
): SplitNode {
  if (node.type === "leaf") {
    if (node.groupId === targetGroupId) {
      return {
        type: "branch",
        direction,
        children: [
          { type: "leaf", groupId: targetGroupId },
          { type: "leaf", groupId: newGroupId },
        ],
      };
    }
    return node;
  }

  return {
    ...node,
    children: node.children.map((c) => insertSplit(c, targetGroupId, newGroupId, direction)),
  };
}
