import React, { useState, useEffect } from "react";
import {
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Box,
  Card,
  CardContent,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import axios from "axios";

// Стилизованные компоненты
const StyledCard = styled(Card)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  padding: theme.spacing(2),
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  marginTop: theme.spacing(3),
}));

const PositiveText = styled("span")(({ theme }) => ({
  color: theme.palette.success.main,
  fontWeight: "bold",
}));

const NegativeText = styled("span")(({ theme }) => ({
  color: theme.palette.warning.main,
  fontWeight: "bold",
}));

// Конфигурация акций
const STOCK_CONFIG = {
  LKOH: { name: "Лукойл", lotSize: 1 },
  LSNGP: { name: "ЛенЭнерго", lotSize: 10 },
  SBER: { name: "Сбербанк", lotSize: 1 },
  PHOR: { name: "Фосагро", lotSize: 1 },
};

// Распределение акций
const STOCKS_DISTRIBUTION = {
  PHOR: 0.25,
  LKOH: 0.25,
  LSNGP: 0.25,
  SBER: 0.25,

};

const InvestmentCalculator = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stockPrices, setStockPrices] = useState({});
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [currentInvestments, setCurrentInvestments] = useState(
    Object.keys(STOCK_CONFIG).reduce((acc, ticker) => {
      acc[ticker] = "";
      return acc;
    }, {})
  );
  const [calculationResult, setCalculationResult] = useState(null);

  // Загрузка цен акций
  useEffect(() => {
    fetchStockPrices();
  }, []);

  const fetchStockPrices = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const pricePromises = Object.keys(STOCK_CONFIG).map(async (ticker) => {
        try {
          const response = await axios.get(
            `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${ticker}.json?iss.meta=off`
          );

          if (response.status === 200) {
            const data = response.data;
            const marketData = data.marketdata.data;

            // Ищем первую запись, где boardid равен "TQBR" или "TQTF"
            const filteredData = marketData.find((d) =>
              ["TQBR", "TQTF"].includes(d[1])
            );

            return {
              ticker,
              price: filteredData ? filteredData[12] : null,
            };
          }
        } catch (err) {
          console.error(`Ошибка загрузки данных для ${ticker}:`, err);
          return { ticker, price: null };
        }
      });

      const results = await Promise.all(pricePromises);
      const prices = results.reduce((acc, { ticker, price }) => {
        acc[ticker] = price;
        return acc;
      }, {});

      setStockPrices(prices);
    } catch (err) {
      setError("Ошибка загрузки данных: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvestmentChange = (ticker, value) => {
    setCurrentInvestments((prev) => ({
      ...prev,
      [ticker]: value,
    }));
  };

  const calculatePurchase = () => {
    const amount = parseFloat(purchaseAmount) || 0;

    // Получаем суммы уже купленных акций
    const currentValues = Object.entries(currentInvestments).reduce(
      (acc, [ticker, value]) => {
        acc[ticker] = parseFloat(value) || 0;
        return acc;
      },
      {}
    );

    // Рассчитываем общую сумму текущих инвестиций
    const totalCurrentInvestments = Object.values(currentValues).reduce(
      (sum, value) => sum + value,
      0
    );

    const stockLots = {};
    const actualAllocation = {};
    let totalStocksCost = 0;
    let remainingAmount = amount;

    // Рассчитываем дефицит для каждой акции
    const deficit = {};
    let totalDeficit = 0;

    for (const [ticker, targetFraction] of Object.entries(
      STOCKS_DISTRIBUTION
    )) {
      // Целевая сумма с учетом текущих инвестиций и новых средств
      const targetAmount = (totalCurrentInvestments + amount) * targetFraction;

      // Текущие инвестиции в эту акцию
      const currentAmount = currentValues[ticker] || 0;

      // Дефицит = сколько нужно докупить до целевой суммы
      const tickerDeficit = Math.max(0, targetAmount - currentAmount);

      deficit[ticker] = tickerDeficit;
      totalDeficit += tickerDeficit;
    }

    // Распределение средств пропорционально дефициту
    if (totalDeficit > 0) {
      for (const [ticker, tickerDeficit] of Object.entries(deficit)) {
        const price = stockPrices[ticker];
        if (!price || price <= 0) continue;

        const lotSize = STOCK_CONFIG[ticker].lotSize;
        const minLotCost = price * lotSize;

        // Пропорция для этой акции
        const proportion = tickerDeficit / totalDeficit;

        // Сумма для инвестирования в эту акцию
        const amountForTicker = amount * proportion;

        // Покупаем целое количество лотов
        const lots = Math.floor(amountForTicker / minLotCost);
        if (lots > 0) {
          const actualAmount = lots * minLotCost;

          stockLots[ticker] = lots;
          actualAllocation[ticker] = actualAmount;
          totalStocksCost += actualAmount;
          remainingAmount -= actualAmount;
        }
      }
    }

    // Распределение остатка (если есть)
    if (remainingAmount > 0) {
      // Сортируем акции по отклонению от целевой доли (наибольшее отклонение в начале)
      const sortedByDeviation = Object.entries(STOCKS_DISTRIBUTION)
        .map(([ticker, targetFraction]) => {
          const currentAmount = currentValues[ticker] || 0;
          const allocatedAmount = actualAllocation[ticker] || 0;
          const totalAmount = currentAmount + allocatedAmount;
          const targetAmount =
            (totalCurrentInvestments + amount) * targetFraction;
          const deviation = (targetAmount - totalAmount) / targetAmount;

          return { ticker, deviation };
        })
        .sort((a, b) => b.deviation - a.deviation);

      // Покупаем лоты для акций с наибольшим отклонением
      for (const { ticker } of sortedByDeviation) {
        const price = stockPrices[ticker];
        if (!price || price <= 0 || remainingAmount <= 0) continue;

        const lotSize = STOCK_CONFIG[ticker].lotSize;
        const minLotCost = price * lotSize;

        if (remainingAmount >= minLotCost) {
          const additionalLots = Math.floor(remainingAmount / minLotCost);
          if (additionalLots > 0) {
            const additionalAmount = additionalLots * minLotCost;

            stockLots[ticker] = (stockLots[ticker] || 0) + additionalLots;
            actualAllocation[ticker] =
              (actualAllocation[ticker] || 0) + additionalAmount;
            totalStocksCost += additionalAmount;
            remainingAmount -= additionalAmount;
          }
        }
      }
    }

    // Общая стоимость портфеля акций после покупки
    const totalPortfolioAfter = totalCurrentInvestments + totalStocksCost;

    setCalculationResult({
      stockLots,
      actualAllocation,
      totalStocksCost,
      totalPortfolioAfter,
      totalCurrentInvestments,
    });
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Инвестиционный калькулятор акций
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Typography variant="h6" component="h2">
            Текущие котировки акций
          </Typography>
          <Button
            onClick={fetchStockPrices}
            disabled={isLoading}
            sx={{ ml: 2 }}
            variant="outlined"
            size="small"
          >
            Обновить
          </Button>
        </Box>

        {isLoading && <LinearProgress sx={{ mb: 2 }} />}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {Object.entries(STOCK_CONFIG).map(([ticker, { name }]) => (
            <Card key={ticker} variant="outlined" sx={{ p: 1, minWidth: 120 }}>
              <Typography variant="body2" color="text.secondary">
                {name}
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {stockPrices[ticker]
                  ? `${stockPrices[ticker].toFixed(2)} руб.`
                  : "Н/Д"}
              </Typography>
            </Card>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Параметры расчета
        </Typography>

        <TextField
          fullWidth
          label="Сумма на покупку акций"
          type="number"
          value={purchaseAmount}
          onChange={(e) => setPurchaseAmount(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            endAdornment: "руб.",
          }}
        />

        <SectionTitle variant="h6">Уже купленные акции:</SectionTitle>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 2,
          }}
        >
          {Object.entries(STOCK_CONFIG).map(([ticker, { name }]) => (
            <TextField
              key={ticker}
              label={name}
              type="number"
              value={currentInvestments[ticker]}
              onChange={(e) => handleInvestmentChange(ticker, e.target.value)}
              InputProps={{
                endAdornment: "руб.",
              }}
            />
          ))}
        </Box>

        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={calculatePurchase}
          disabled={isLoading}
          sx={{ mt: 3 }}
        >
          Рассчитать покупки
        </Button>
      </Paper>

      {calculationResult && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Рекомендованные покупки:
          </Typography>

          <List>
            {Object.entries(calculationResult.stockLots).map(
              ([ticker, lots]) => {
                const price = stockPrices[ticker] || 0;
                const lotSize = STOCK_CONFIG[ticker].lotSize;
                const name = STOCK_CONFIG[ticker].name;
                const cost = lots * lotSize * price;

                // Сумма старых инвестиций в эту акцию
                const currentAmount =
                  parseFloat(currentInvestments[ticker]) || 0;

                // Целевой процент
                const idealPercentage = STOCKS_DISTRIBUTION[ticker] * 100;

                // Фактический процент ПОСЛЕ покупки
                const actualPercentage =
                  calculationResult.totalPortfolioAfter > 0
                    ? ((currentAmount + cost) /
                        calculationResult.totalPortfolioAfter) *
                      100
                    : 0;

                const deviation = Math.abs(actualPercentage - idealPercentage);

                return (
                  <React.Fragment key={ticker}>
                    <ListItem alignItems="flex-start">
                      <ListItemText
                        primary={`${name} (${lots} лотов)`}
                        secondary={
                          <Box component="span">
                            <Typography variant="body2" color="text.primary">
                              Цена: {price.toFixed(2)} руб. (лот: {lotSize} шт.)
                            </Typography>
                            <Typography variant="body2" color="text.primary">
                              Идеал: {idealPercentage.toFixed(1)}% • Факт:{" "}
                              {actualPercentage.toFixed(1)}%
                            </Typography>
                            <Typography
                              variant="body2"
                              color={
                                deviation <= 1 ? "success.main" : "warning.main"
                              }
                              fontWeight="600"
                            >
                              Отклонение: {deviation.toFixed(1)}%
                            </Typography>
                            <Typography variant="body2" color="text.primary">
                              Текущие: {currentAmount.toFixed(0)} руб. • Новые:{" "}
                              {cost.toFixed(0)} руб.
                            </Typography>
                          </Box>
                        }
                      />
                      <Typography variant="h6" fontWeight="bold">
                        {cost.toFixed(2)} руб.
                      </Typography>
                    </ListItem>
                    <Divider variant="inset" component="li" />
                  </React.Fragment>
                );
              }
            )}
          </List>

          <Box
            sx={{
              mt: 3,
              p: 2,
              backgroundColor: "primary.light",
              borderRadius: 1,
            }}
          >
            <Typography variant="body1" gutterBottom>
              Стоимость новых покупок:{" "}
              <PositiveText>
                {calculationResult.totalStocksCost.toFixed(2)} руб.
              </PositiveText>
            </Typography>
            <Typography variant="body1" gutterBottom>
              Общая стоимость портфеля акций:{" "}
              <PositiveText>
                {calculationResult.totalPortfolioAfter.toFixed(2)} руб.
              </PositiveText>
            </Typography>
            {calculationResult.totalCurrentInvestments > 0 && (
              <Typography variant="body1">
                Текущие инвестиции:{" "}
                {calculationResult.totalCurrentInvestments.toFixed(2)} руб.
              </Typography>
            )}
          </Box>
        </Paper>
      )}
    </Container>
  );
};

export default InvestmentCalculator;
