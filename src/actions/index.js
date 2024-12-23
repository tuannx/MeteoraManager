export { handleOpenPosition } from './OpenPosition.js';
export { handleRemovePosition } from './RemovePosition.js';
export { handleCheckPositions } from './CheckPositions.js';
export { handleWalletOperations } from './WalletOperations.js';
export { handleReopenPosition } from './ReopenPosition.js';
export { handleTokenConsolidation } from './TokenOperations.js';
export { handlePoolCheck } from './PoolOperations.js';
export { handleAutoCheck } from './AutoChecker.js';
export { handleSolDistribution, handleSolConsolidation } from './SolOperations.js';
export { handleOpenTokenPosition } from './OpenTokenPosition.js';

export const ACTIONS = {
    ADD_LIQUIDITY: '1',
    REMOVE_LIQUIDITY: '2',
    REOPEN_POSITION: '3',
    WALLET_MENU: '4',
    POOL_CHECK: '5',
    AUTO_CHECK: '6'
};

export const ADD_LIQUIDITY_ACTIONS = {
    TOKEN_LIQUIDITY: '1',
    SOL_LIQUIDITY: '2'
};

export const WALLET_ACTIONS = {
    CHECK_POSITIONS: '1',
    WALLET_OPERATIONS: '2',
    CONSOLIDATION_MENU: '3',
    SOL_DISTRIBUTION: '4'
};

export const CONSOLIDATION_ACTIONS = {
    TOKEN_CONSOLIDATION: '1',
    SOL_CONSOLIDATION: '2'
};
