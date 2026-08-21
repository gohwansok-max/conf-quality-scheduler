import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { healthCertificateRouter } from "./healthCertificateRouter";
import { qualitySchedulerRouter } from "./qualitySchedulerRouter";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(() => null),
    logout: publicProcedure.mutation(() => {
      return {
        success: true,
      } as const;
    }),
  }),
  qualityScheduler: qualitySchedulerRouter,
  healthCertificate: healthCertificateRouter,
});

export type AppRouter = typeof appRouter;
