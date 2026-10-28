import { z } from "zod";

// The JSON shape every provider must return (see Extraction in ../types). Only loaded with a provider.
export const ExtractionSchema = z.object({
  mood: z.number().nullable().describe("Overall mood 1-10 if stated or clearly implied, else null"),
  energy: z.number().nullable().describe("Energy level 1-10 if stated or clearly implied, else null"),
  sleep_hours: z.number().nullable().describe("Hours slept the night before, else null"),
  activities: z.array(
    z.object({
      name: z.string().describe("Short lowercase name, e.g. 'gym', 'csc 424 homework'"),
      category: z.string().describe("Exactly one of the time categories"),
      hours: z.number().nullable().describe("Duration in hours if stated or clearly implied, else null"),
    }),
  ),
  expenses: z.array(
    z.object({
      amount: z.number().describe("Amount in dollars"),
      merchant: z.string().describe("Where or what, short lowercase, e.g. 'chipotle', 'gas'"),
      category: z.string().describe("Exactly one of the money categories"),
    }),
  ),
  people: z.array(z.string()).describe("First names or roles of people mentioned"),
  places: z.array(z.string()).describe("Places mentioned"),
  themes: z.array(z.string()).describe("1-4 short recurring-topic labels, e.g. 'exams', 'fundraising'"),
  sentiment: z.number().nullable().describe("Overall tone from -1 (very negative) to 1 (very positive)"),
  notable_events: z.array(z.string()).describe("0-3 one-line notable events"),
});
