import { z } from "zod";
import { isStateCode } from "../states";

export const forecastState = z.string().refine(isStateCode);
export const planAmount = z.number().finite().nonnegative().max(10_000_000);
export const peopleCount = z.number().int().min(1).max(5);
export const bedroomCount = z.number().int().min(0).max(4);
export const forecastSchema = z.object({
  origin: forecastState, destination: forecastState,
  originMetro: z.string().regex(/^\d{5}$/).optional(), destinationMetro: z.string().regex(/^\d{5}$/).optional(),
  people: peopleCount, bedrooms: bedroomCount, payMode: z.enum(["gross", "net"]),
  pay: planAmount, filing: z.enum(["single", "joint"]), offer: planAmount.nullable(), moving: z.union([planAmount, z.literal("estimate")]),
}).refine(f => f.origin !== f.destination);
export type Forecast = z.infer<typeof forecastSchema>;
