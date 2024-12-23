import pkg from '@solana/web3.js';
const { Keypair, LAMPORTS_PER_SOL } = pkg;
import bs58 from 'bs58';
import { getTokenInfoByTokenAddress, formatNumber, getSolPrice } from './utils.service.js';
import { connection, getConnection, TOKEN_PROGRAM_ID } from '../config/index.js';
import { question } from '../utils/question.js';
import { getPositions } from '../utils/GetPosition.js';
import { handleRemovePosition } from '../actions/RemovePosition.js';
import { handleTokenConsolidation } from '../actions/TokenOperations.js';
import { handleSolConsolidation, handleSolDistribution } from '../actions/SolOperations.js';
import { processClaimRewards } from './position.service.js';
import { displayLogo } from '../utils/logger.js';

export async function displayPositionsTable(wallets,positionCheck = true) {
    const tableData = [];
    const solPrice = await getSolPrice();
    
    // Добавляем переменные для подсчета общих сумм
    let totalPositionsValue = 0;
    let totalFeesValue = 0;
    // Создаем Map для хранения пар адрес:имя
    const uniquePools = new Map();

    console.log("\n\x1b[36m[⌛] WAITING | Получение информации о позициях...\x1b[0m");

    const promises = wallets.map(async (wallet) => {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
        const positions = await getPositions(user);
        
        if (positions && positions.length > 0) {
            for (const position of positions) {
                // Сохраняем адрес и имя пула в Map
                uniquePools.set(position.poolAddress, position.poolInfo.name);
                
                const token1Amount = position.amounts.token1;
                const token2Amount = position.amounts.token2;
                const positionToken1 = position.amounts.positionToken1;
                const positionToken2 = position.amounts.positionToken2;
                
                const tokenFeeUSD = position.poolInfo.currentPrice * token1Amount * solPrice;
                const solFeeUSD = solPrice * token2Amount;
                const totalFeeUSD = tokenFeeUSD + solFeeUSD;

                const pool = positionCheck ? position.poolAddress.slice(0, 4) + '..' : position.poolAddress;

                const positionToken1USD = position.poolInfo.currentPrice * positionToken1 * solPrice;
                const positionToken2USD = solPrice * positionToken2;
                const totalPositionUSD = positionToken1USD + positionToken2USD;

                // Добавляем к общим суммам
                totalPositionsValue += totalPositionUSD;
                totalFeesValue += totalFeeUSD;

                // Расчет процента для token price
                const currentTokenPrice = 1 / Number(position.binPrices.current);
                const upperTokenPrice = 1 / Number(position.binPrices.upper);
                const percentFromCurrent = ((upperTokenPrice - currentTokenPrice) / currentTokenPrice * 100).toFixed(2);
                const priceIndicator = `${percentFromCurrent > 0 ? '+' : ''}${percentFromCurrent}%`;

                tableData.push({
                    '👛 WALLET': wallet.description.slice(0, 4) + '..',
                    '🏊 POOL': pool,
                    '📊 VOL-24h': `${formatNumber(position.poolInfo.tradeVolume24h)}`,
                    '📊 FEES-24h': `$${formatNumber(position.poolInfo.fees24h)}`,
                    '🪙 TOKEN/PRICE': `${position.poolInfo.name.split('-')[0]} / $${Number(position.poolInfo.currentPrice).toFixed(8)} (${priceIndicator})`,
                    '📈 RANGE': `${Number(position.binPrices.lower).toFixed(8)} - ${Number(position.binPrices.upper).toFixed(8)}`,
                    '💱 TOKEN/SOL-VALUE': `${formatNumber(positionToken1.toFixed(4))} / ${formatNumber(positionToken2.toFixed(4))} SOL`,
                    '🤑 TOTAL-VALUE': `$${totalPositionUSD.toFixed(2)}`,
                    '💱 TOKEN/SOL-FEE': `${token1Amount.toFixed(3)} / ${token2Amount.toFixed(3)} SOL`,
                    '🤑 TOTAL-FEE': `$${totalFeeUSD.toFixed(2)}`,
                });
            }
        }
    });

    await Promise.all(promises);

    if (tableData.length > 0) {
        if (positionCheck) {
            await displayLogo();
        }
        console.log("\n\x1b[36m | ИНФОРМАЦИЯ О ПОЗИЦИЯХ\x1b[0m");
        console.table(tableData);
        console.log(`\n\x1b[36m-+-\x1b[0m ОБЩАЯ СТОИМОСТЬ ВСЕХ ПОЗИЦИЙ: \x1b[32m$${formatNumber(totalPositionsValue.toFixed(2))}\x1b[0m`);
        console.log(`\x1b[36m-+-\x1b[0m ОБЩАЯ СУММА ВСЕХ КОМИССИЙ: \x1b[32m$${formatNumber(totalFeesValue.toFixed(2))}\x1b[0m`);
        
        console.log("\n\x1b[36m-+-\x1b[0m СПИСОК ПУЛОВ:");
        uniquePools.forEach((name, pool) => {
            console.log(`
\x1b[36m• POOL: \x1b[0m${name}
  └─ \x1b[90mAddress:\x1b[0m ${pool}
  └─ \x1b[90mLinks:\x1b[0m
     • \x1b[34mPhoton\x1b[0m: https://photon-sol.tinyastro.io/en/lp/${pool}
     • \x1b[34mMeteora\x1b[0m: https://app.meteora.ag/dlmm/${pool}
`);
        });
        if (positionCheck) {
            const Choice = await question("\n[...] Выберите действие: \n1: Закрыть позиции\n2: Повторная проверка\n3: Клейм комсы\n4: Выйти\nВыберите: ");
            if (Choice === '1') {
                await handleRemovePosition(wallets);
            } else if (Choice === '2') {
                await displayPositionsTable(wallets, true);
            } else if (Choice === '3') {
                const poolAddress = await question("\n[...] Введите адрес пула: ");
                await processClaimRewards(wallets, poolAddress);
            } else {
                process.exit(1);
            }
        }
    } else {
        console.log("\n[!] Нет активных позиций для отображения");
        process.exit(0);
    }
}

export async function walletInfo(wallets, positionCheck = true) {
    const tableData = [];
    const solBalances = [];
    let totalUsdValue = 0;
    const solPrice = await getSolPrice();
    console.log("\n[⌛] Получение информации о кошельках...");

    const promises = wallets.map(async (wallet) => {
        try {
            const conn = await getConnection();
            await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            
            // Получаем баланс SOL
            const solBalance = await conn.getBalance(user.publicKey);
            const solValue = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
            const solUsdValue = (solValue * solPrice).toFixed(2);
            
            solBalances.push({
                "Адрес кошелька": user.publicKey.toString(),
                "SOL": solValue,
                "USD": `$${solUsdValue}`
            });
            totalUsdValue += parseFloat(solUsdValue);

            if (positionCheck) {    // Получаем токены
                const tokens = await conn.getParsedTokenAccountsByOwner(
                    user.publicKey,
                    { programId: TOKEN_PROGRAM_ID }
                );

                const tokenPromises = tokens.value.map(async ({ account }) => {
                    const tokenInfo = account.data.parsed.info;
                    const tokenAmount = tokenInfo.tokenAmount;

                    if (tokenAmount.uiAmount > 0) {
                        try {
                            const tokenData = await getTokenInfoByTokenAddress(tokenInfo.mint);
                            if (tokenData.priceUSD !== "0") {
                                const usdValue = (tokenAmount.uiAmount * parseFloat(tokenData.priceUSD)).toFixed(2);
                                
                                tableData.push({
                                    "Адрес кошелька": user.publicKey.toString().slice(0, 4) + '..',
                                    "Токен": tokenData.tokenSymbol,
                                    "Количество": formatNumber(tokenAmount.uiAmount),
                                    "Цена": `$${tokenData.priceUSD}`,
                                    "Стоимость": `$${formatNumber(parseFloat(usdValue))}`
                                });
                                
                                totalUsdValue += parseFloat(usdValue);
                            }
                        } catch (error) {
                            console.log(`~~~ [!] [${user.publicKey.toString().slice(0, 4)}..] Пропущен токен ${tokenInfo.mint}: нет данных о цене | utils.js`);
                        }
                    }
                });
                await Promise.all(tokenPromises);
            }
        } catch (error) {
            console.error(`~~~ [!] [${wallet.description.slice(0, 4)}..] Ошибка обработки кошелька | UserInfo.js`);
        }
    });

    await Promise.all(promises);

    if (positionCheck) {
        await displayLogo();
    }

    if (solBalances.length > 0) {
        console.log("\n\x1b[36m-+-\x1b[0m БАЛАНСЫ SOL:");
        console.table(solBalances);
    }

    if (tableData.length > 0) {
        console.log("\n\x1b[36m-+-\x1b[0m БАЛАНСЫ ТОКЕНОВ:");
        console.table(tableData);
    }

    if (positionCheck) {
        console.log(`\n\x1b[36m-+-\x1b[0m ОБЩАЯ СТОИМОСТЬ ВСЕХ АКТИВОВ: \x1b[32m$${formatNumber(totalUsdValue)}\x1b[0m`);
        

        // Добавляем выбор действий
        const choice = await question("\n[...] Выберите действие:\n1: Консолидировать токены\n2: Консолидировать SOL\n3: Распределить SOL\n4: Завершить\nВыберите: ");

        switch (choice) {
            case '1':
                await handleTokenConsolidation(wallets);
                break;
            case '2':
                await handleSolConsolidation(wallets[0], wallets);
                break;
            case '3':
                await handleSolDistribution(wallets[0], wallets);
                break;
            case '4':
                console.log("\n=== Работа завершена");
                process.exit(0);
                break;
            default:
                console.log("\n[!] Некорректный выбор");
                process.exit(1);
        }
    }
}