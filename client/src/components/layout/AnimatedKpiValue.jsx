import { useAnimatedNumber } from '../../hooks/useAnimatedNumber.js';

export function AnimatedKpiValue({ value, animate = true }) {
  const numeric = typeof value === 'number' ? value : 0;
  const shouldAnimate = animate && typeof value === 'number';
  const animated = useAnimatedNumber(shouldAnimate ? numeric : numeric);

  if (value === null || value === undefined) return <>—</>;
  if (typeof value !== 'number') return <>{value}</>;
  return <>{shouldAnimate ? animated : value}</>;
}