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
  adv_mode: "pct" | "fixed";
  mdr_pct: number;
  mdr_mode: "pct" | "fixed";
  fixed_fees: FoodCourtFixedFees;
  entrance_monthly: number;
  mgmt_pct: number;
  food_pct: number;
  gst_pct: number;
  include_gst: boolean;
  salary: number;
  investor_floor: number;
  investor_share_pct: number;
  couple_floor: number;
  couple_repay_cap: number;
  profit_target: number;
  excess_mgmt_pct: number;
  excess_couple_pct: number;
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
  adv_mode: "pct",
  mdr_pct: 1.5,
  mdr_mode: "pct",
  fixed_fees: {
    cleaning: 0,
    maintenance: 0,
    pos: 0,
    subscription: 0,
    bank: 0,
    legal: 0,
    other: 0
  },
  entrance_monthly: 0,
  mgmt_pct: 3,
  food_pct: 35,
  gst_pct: 9,
  include_gst: true,
  salary: 8000,
  investor_floor: 2800,
  investor_share_pct: 51,
  couple_floor: 3000,
  couple_repay_cap: 4167,
  profit_target: 5600,
  excess_mgmt_pct: 50,
  excess_couple_pct: 25,
  tiers: [25000, 30000, 35000, 40000, 45000, 50000]
});

export const listFoodCourts = () => api<{ food_courts: FoodCourt[] }>("/fnb-food-courts");

export const getFoodCourt = (id: string) => api<{ food_court: FoodCourt }>(`/fnb-food-courts/${id}`);

export const createFoodCourt = (body: FoodCourtInput) =>
  api<{ food_court: FoodCourt }>("/fnb-food-courts", { method: "POST", body });

export const updateFoodCourt = (id: string, body: Partial<FoodCourtInput>) =>
  api<{ food_court: FoodCourt }>(`/fnb-food-courts/${id}`, { method: "PATCH", body });

export const deleteFoodCourt = (id: string) => api<{ ok: true }>(`/fnb-food-courts/${id}`, { method: "DELETE" });
