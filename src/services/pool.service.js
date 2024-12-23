export async function getPoolsInfo(tokenAddress) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        const data = await response.json();
        
        if (!data || !data.pairs || data.pairs.length === 0) {
            throw new Error(`\x1b[31m~~~ [!] | ERROR | Нет данных о пулах для токена\x1b[0m`);
        }

        // Фильтруем пулы Meteora с SOL
        const meteoraSolPools = data.pairs.filter(pair => 
            pair.dexId === 'meteora' && 
            (pair.baseToken.symbol === 'SOL' || pair.quoteToken.symbol === 'SOL')
        );

        // Получаем дополнительную информацию для каждого пула
        const poolsWithDetails = await Promise.all(meteoraSolPools.map(async (pool) => {
            try {
                const detailsResponse = await fetch(`https://app.meteora.ag/clmm-api/pair/${pool.pairAddress}`);
                const details = await detailsResponse.json();
                return {
                    ...pool,
                    binStep: details.bin_step,
                    baseFee: details.base_fee_percentage,
                    fees24: details.fees_24h,
                    currentPrice: details.current_price,
                    liquidity: details.liquidity,
                    protocolFee: details.protocol_fee_percentage,
                    mintX: details.mint_x,
                    tradeVolume: details.trade_volume_24h
                };
            } catch (error) {
                return {
                    ...pool,
                    binStep: 'Н/Д',
                    baseFee: 'Н/Д',
                    fees24: 'Н/Д',
                    currentPrice: 'Н/Д',
                    liquidity: 'Н/Д',
                    protocolFee: 'Н/Д',
                    mintX: 'Н/Д',
                    tradeVolume: 'Н/Д'
                };
            }
        }));
        
        return poolsWithDetails;
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при получении информации о пулах: ${error}\x1b[0m`);
        return [];
    }
} 