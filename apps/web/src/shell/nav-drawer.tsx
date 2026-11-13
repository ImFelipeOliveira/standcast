import { createContext, useContext } from 'react';

export type NavDrawer = { open: boolean; toggle: () => void; close: () => void };

export const NavDrawerContext = createContext<NavDrawer>({
  open: false,
  toggle: () => undefined,
  close: () => undefined,
});

export function useNavDrawer(): NavDrawer {
  return useContext(NavDrawerContext);
}
