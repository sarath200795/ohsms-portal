import { createContext, useContext } from 'react';

export const AppTransitionContext = createContext(() => {});

export const useAppTransition = () => useContext(AppTransitionContext);
