export async function getPoolsInfo(tokenAddress) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        const data = await response.json();
        
        if (!data || !data.pairs || data.pairs.length === 0) {
            throw new Error(`\x1b[31m~~~ [!] | ERROR | No pool data for this token\x1b[0m`);
        }

        // Filter Meteora pools with SOL
        const meteoraSolPools = data.pairs.filter(pair => 
            pair.dexId === 'meteora' && 
            (pair.baseToken.symbol === 'SOL' || pair.quoteToken.symbol === 'SOL')
        );

        // Get additional information for each pool
        const poolsWithDetails = await Promise.all(meteoraSolPools.map(async (pool) => {
            try {
                const detailsResponse = await fetch(`https://app.meteora.ag/clmm-api/pair/${pool.pairAddress}`);
                const details = await detailsResponse.json();
                return {
                    ...pool,
                    name: details.name,
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
                    name: 'N/A',
                    binStep: 'N/A',
                    baseFee: 'N/A',
                    fees24: 'N/A',
                    currentPrice: 'N/A',
                    liquidity: 'N/A',
                    protocolFee: 'N/A',
                    mintX: 'N/A',
                    tradeVolume: 'N/A'
                };
            }
        }));
        
        return poolsWithDetails;
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error getting pool information: ${error}\x1b[0m`);
        return [];
    }
}