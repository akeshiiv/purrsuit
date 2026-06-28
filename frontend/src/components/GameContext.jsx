/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

const GameContext = createContext(null);

export function GameProvider({ children, value }) {
  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const value = useContext(GameContext);
  if (!value) {
    throw new Error('useGame must be used inside GameProvider');
  }
  return value;
}
