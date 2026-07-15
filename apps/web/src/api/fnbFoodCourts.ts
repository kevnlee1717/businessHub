import { api } from "./client";

export const fnbFoodCourtKeys = {
  all: ["fnb-food-courts"] as const,
  list: () => ["fnb-food-courts", "list"] as const,
  detail: (id: string) => ["fnb-food-courts", id] as const
};

export type FoodCourtFixedFees = {
  cleaning: number;
  maintenance: number;
  pos: number;
  subscription: number;
  bank: number;
  legal: number;
  other: number;
};

export type FoodCourtInput = {
  name: string;
  stall: string | null;
  brand: string | null;
  notes: string | null;
  rent_pct: number;
  min_rent: number;
  adv_pct: number;
  mdr_pct: number;
  fixed_fees: FoodCourtFixedFees;
  entrance_total: number;
  entrance_months: number;
  food_pct: number;
  gst_pct: number;
  include_gst: boolean;
  salary: number;
  investor_floor: number;
  profit_target: number;
  tiers: number[];
};

export type FoodCourt = FoodCourtInput & {
  id: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export const foodCourtDefaults = (): FoodCourtInput => ({
  name: "",
  stall: null,
  brand: null,
  notes: null,
  rent_pct: 24.5,
  min_rent: 0,
  adv_pct: 0.7,
  mdr_pct: 1.5,
  fixed_fees: {
    cleaning: 0,
    maintenance: 0,
    pos: 0,
    subscription: 0,
    bank: 0,
    legal: 0,
    other: 0
  },
  entrance_total: 0,
  entrance_months: 0,
  food_pct: 35,
  gst_pct: 9,
  include_gst: true,
  salary: 8000,
  investor_floor: 2800,
  profit_target: 5600,
  tiers: [25000, 30000, 35000]
});

export const listFoodCourts = () => api<{ food_courts: FoodCourt[] }>("/fnb-food-courts");

export const getFoodCourt = (id: string) => api<{ food_court: FoodCourt }>(`/fnb-food-courts/${id}`);

export const createFoodCourt = (body: FoodCourtInput) =>
  api<{ food_court: FoodCourt }>("/fnb-food-courts", { method: "POST", body });

export const updateFoodCourt = (id: string, body: Partial<FoodCourtInput>) =>
  api<{ food_court: FoodCourt }>(`/fnb-food-courts/${id}`, { method: "PATCH", body });

export const deleteFoodCourt = (id: string) => api<{ ok: true }>(`/fnb-food-courts/${id}`, { method: "DELETE" });
