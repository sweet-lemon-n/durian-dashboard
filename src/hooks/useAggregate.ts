import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AggregateData {
  meta?: { title?: string; subtitle?: string };
  visibility?: Record<string, boolean>;
  global?: {
    totalOrders: number;
    totalBoxes: number;
    totalArrived: number;
    totalDone: number;
    totalMoving: number;
    totalPending: number;
  };
  th?: CountryData;
  vn?: CountryData;
  logistics?: unknown;
  news?: unknown;
  _source?: string;
  generatedAt?: string;
}

export interface CountryData {
  country: string;
  flag: string;
  brands: BrandData[];
  kpis: KpiData;
  overall: OverallData;
}

export interface BrandData {
  brand: string;
  category: string;
  orders: number;
  boxes: number;
  signed: number;
  delivered: number;
  transit: number;
  pending: number;
  rate: number;
}

export interface KpiData {
  totalOrders: number;
  totalBoxes: number;
  doneBoxes: number;
  doneRate: number;
  transitBoxes: number;
  portBoxes: number;
  pendingBoxes: number;
}

export interface OverallData {
  signed: number;
  delivered: number;
  transit?: number;
  port?: number;
  pending?: number;
}

export function useAggregate() {
  return useQuery<AggregateData>({
    queryKey: ['aggregate'],
    queryFn: () => api<AggregateData>('/api/aggregate', { cache: 'no-store' }),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
