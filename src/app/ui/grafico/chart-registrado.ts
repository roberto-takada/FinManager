import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

/**
 * Só as partes do Chart.js que os gráficos usam (o resto fica fora do bundle). Este módulo
 * é carregado sob demanda pelo componente de gráfico, fora do carregamento inicial.
 */
Chart.register(
  LineController,
  LineElement,
  PointElement,
  Filler,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
);

export { Chart };
