import { useCallback, useRef } from "react";
import {
  type NativeMenuItem,
  showNativeContextMenu,
} from "./native-context-menu";

export function useNativeContextMenu(
  getItems: () => NativeMenuItem[],
  onAction: (actionId: string) => void,
) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      showNativeContextMenu(getItems()).then((id) => {
        if (id) onActionRef.current(id);
      });
    },
    [getItems],
  );

  return { onContextMenu };
}
