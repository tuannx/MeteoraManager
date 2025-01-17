process.env.NODE_NO_WARNINGS = '1';
process.removeAllListeners('warning');

import { WALLETS } from './src/config/index.js';
import { question } from './src/utils/question.js';
import { ACTIONS, WALLET_ACTIONS, CONSOLIDATION_ACTIONS, ADD_LIQUIDITY_ACTIONS } from './src/actions/index.js';
import { displayPositionsTable } from './src/services/wallet.service.js';
import * as actions from './src/actions/index.js';
import { displayLogo, selectWallets, strategyType } from './src/utils/logger.js';
import { returnToMainMenu } from './src/utils/mainMenuReturn.js';

const ACTION_DESCRIPTIONS = {
    [ACTIONS.ADD_LIQUIDITY]: "Add liquidity",
    [ACTIONS.REMOVE_LIQUIDITY]: "Remove liquidity",
    [ACTIONS.REOPEN_POSITION]: "Reopen position",
    [ACTIONS.WALLET_MENU]: "Wallets",
    [ACTIONS.POOL_CHECK]: "Pool checker",
    [ACTIONS.AUTO_CHECK]: "Auto position checker",
    [ACTIONS.SWAP_TOKENS]: "Swap",
    [ACTIONS.EXIT]: "Exit",
};

const WALLET_MENU_DESCRIPTIONS = {
    [WALLET_ACTIONS.CHECK_POSITIONS]: "Check positions",
    [WALLET_ACTIONS.WALLET_OPERATIONS]: "Check balance",
    [WALLET_ACTIONS.CONSOLIDATION_MENU]: "Consolidation",
    [WALLET_ACTIONS.SOL_DISTRIBUTION]: "Distribute SOL",
};

const CONSOLIDATION_MENU_DESCRIPTIONS = {
    [CONSOLIDATION_ACTIONS.TOKEN_CONSOLIDATION]: "Consolidate tokens",
    [CONSOLIDATION_ACTIONS.SOL_CONSOLIDATION]: "Consolidate SOL",
};

export async function main() {
    try {
        await displayLogo();
        console.log("\nAVAILABLE FUNCTIONS: \n=========================");
        Object.entries(ACTION_DESCRIPTIONS).forEach(([key, value]) => {
            console.log(`\x1b[36m-+-\x1b[0m ${key}: ${value.toUpperCase()}`);
        });

        const action = await question("\n[...] Select an action (1-8): ");
        
        if (action === ACTIONS.EXIT) {
            console.log("\nExiting...");
            process.exit(0);
        }

        if (action === ACTIONS.SWAP_TOKENS) {
            const FastWalletsWay = await question("\n[...] Use all wallets?\n1: Yes\n2: No\nSelect: ");
            const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
            await actions.handleSwapTokens(selectedWallets);
            return;
        }

        if (action === ACTIONS.ADD_LIQUIDITY) {
            console.log("\nSELECT LIQUIDITY TYPE:\n=========================");
            console.log(`\x1b[36m-+-\x1b[0m 1: IN TOKENS`);
            console.log(`\x1b[36m-+-\x1b[0m 2: IN SOL`);
            
            const liquidityType = await question("\n[...] Select type (1-2): ");
            
            if (liquidityType === ADD_LIQUIDITY_ACTIONS.TOKEN_LIQUIDITY) {
                const FastWalletsWay = await question("\n[...] Use all wallets?\n1: Yes\n2: No\nSelect: ");
                const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
                await actions.handleOpenTokenPosition(selectedWallets);
                return;
            } else if (liquidityType === ADD_LIQUIDITY_ACTIONS.SOL_LIQUIDITY) {
                const FastWalletsWay = await question("\n[...] Use all wallets?\n1: Yes\n2: No\nSelect: ");
                const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
                await actions.handleOpenPosition(selectedWallets);
                return;
            }
        }

        const handler = getActionHandler(action);
        
        if (!handler) {
            console.log("~~~ [!] This function is under development");
            returnToMainMenu();
        }

        if (action === ACTIONS.AUTO_CHECK) {
            let strategy;
            await displayLogo();
            await displayPositionsTable(Object.values(WALLETS), false);
            console.log("\nSELECT ACTION WHEN EXITING RANGE:\n=========================");
            console.log(`\x1b[36m-+-\x1b[0m 1: Close positions and sell tokens`);
            console.log(`\x1b[36m-+-\x1b[0m 2: Reopen positions in tokens`);
            const autoCheckAction = await question("\n[...] Select an action (1-2): ");
            if (autoCheckAction === "2") {
                strategy = await strategyType();
            } else {
                strategy = "1";
            }
            const FastWalletsWay = await question("\n[...] Use all wallets?\n1: Yes\n2: No\nSelect: ");
            const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
            
            const poolAddress = await question("\n[...] Enter the pool address you want to monitor: ");

            await handler(selectedWallets, autoCheckAction, poolAddress, strategy);
            return;
        }

        if (action === ACTIONS.POOL_CHECK || action === ACTIONS.WALLET_MENU) {
            await handler();
        } else {
            const FastWalletsWay = await question("\n[...] Use all wallets?\n1: Yes\n2: No\nSelect: ");
            const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();

            if (action === ACTIONS.SOL_DISTRIBUTION || action === ACTIONS.SOL_CONSOLIDATION) {
                const MainWallet = WALLETS[1];
                await handler(MainWallet, selectedWallets);
            } else {
                await handler(selectedWallets);
            }
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

async function handleWalletMenu() {
    console.log("\nWALLET MENU:\n=========================");
    Object.entries(WALLET_MENU_DESCRIPTIONS).forEach(([key, value]) => {
        console.log(`\x1b[36m-+-\x1b[0m ${key}: ${value.toUpperCase()}`);
    });

    const walletAction = await question("\n[...] Select an action (1-4): ");
    
    if (walletAction === WALLET_ACTIONS.CONSOLIDATION_MENU) {
        return handleConsolidationMenu();
    }

    const FastWalletsWay = await question("\n[...] Use all wallets?\n1: Yes\n2: No\nSelect: ");
    const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
    const handler = getWalletActionHandler(walletAction);
    
    if (!handler) {
        console.log("~~~ [!] This function is under development");
        return;
    }

    if (walletAction === WALLET_ACTIONS.SOL_DISTRIBUTION) {
        const MainWallet = WALLETS[1];
        await handler(MainWallet, selectedWallets);
    } else {
        await handler(selectedWallets);
    }
}

async function handleConsolidationMenu() {
    console.log("\nCONSOLIDATION MENU:\n=========================");
    Object.entries(CONSOLIDATION_MENU_DESCRIPTIONS).forEach(([key, value]) => {
        console.log(`\x1b[36m-+-\x1b[0m ${key}: ${value.toUpperCase()}`);
    });

    const consolidationAction = await question("\n[...] Select an action (1-2): ");
    const FastWalletsWay = await question("\n[...] Use all wallets?\n1: Yes\n2: No\nSelect: ");
    const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
    const handler = getConsolidationActionHandler(consolidationAction);
    
    if (!handler) {
        console.log("~~~ [!] This function is under development");
        return;
    }

    const MainWallet = WALLETS[1];
    await handler(MainWallet, selectedWallets);
}

function getActionHandler(action) {
    const handlers = {
        [ACTIONS.ADD_LIQUIDITY]: actions.handleOpenPosition,
        [ACTIONS.REMOVE_LIQUIDITY]: actions.handleRemovePosition,
        [ACTIONS.REOPEN_POSITION]: actions.handleReopenPosition,
        [ACTIONS.WALLET_MENU]: handleWalletMenu,
        [ACTIONS.POOL_CHECK]: actions.handlePoolCheck,
        [ACTIONS.AUTO_CHECK]: actions.handleAutoCheck,
        [ACTIONS.SWAP_TOKENS]: actions.handleSwapTokens,
    };
    return handlers[action];
}

function getWalletActionHandler(action) {
    const handlers = {
        [WALLET_ACTIONS.CHECK_POSITIONS]: actions.handleCheckPositions,
        [WALLET_ACTIONS.WALLET_OPERATIONS]: actions.handleWalletOperations,
        [WALLET_ACTIONS.SOL_DISTRIBUTION]: actions.handleSolDistribution,
    };
    return handlers[action];
}

function getConsolidationActionHandler(action) {
    const handlers = {
        [CONSOLIDATION_ACTIONS.TOKEN_CONSOLIDATION]: actions.handleTokenConsolidation,
        [CONSOLIDATION_ACTIONS.SOL_CONSOLIDATION]: actions.handleSolConsolidation,
    };
    return handlers[action];
}

main();
