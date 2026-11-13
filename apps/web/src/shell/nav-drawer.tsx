import { createContext, useContext } from 'react';

export type NavDrawer = {
  inShell: boolean;
  open: boolean;
  toggle: () => void;
  close: (restoreFocus?: boolean) => void;
};

export const NavDrawerContext = createContext<NavDrawer>({
  inShell: false,
  open: false,
  toggle: () => undefined,
  close: () => undefined,
});

export function useNavDrawer(): NavDrawer {
  return useContext(NavDrawerContext);
}
