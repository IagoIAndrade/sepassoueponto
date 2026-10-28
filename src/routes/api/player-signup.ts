import { createFileRoute } from "@tanstack/react-router";
import { processPlayerSignup } from "@/lib/player-signup.server";

const SIGNUP_VERSION = "signup-route-v4-20260806";

export const Route = createFileRoute("/api/player-signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.info(`[${SIGNUP_VERSION}] request_received`);

        let formData: FormData;

        try {
          // A única chamada request.formData() em todo o fluxo de transporte
          formData = await request.formData();
        } catch (error) {
          console.error(`[${SIGNUP_VERSION}] form_data_parse_failed`, error);

          return Response.json(
            {
              success: false,
              version: SIGNUP_VERSION,
              stage: "form_data",
              code: "FORM_DATA_PARSE_FAILED",
              userMessage: "Não foi possível processar os dados enviados.",
              technicalMessage: error instanceof Error ? error.message : String(error),
            },
            { status: 400 }
          );
        }

        try {
          const result = await processPlayerSignup(formData);

          return Response.json(
            {
              ...result,
              version: SIGNUP_VERSION,
            },
            {
              status: result.success ? 200 : 400,
            }
          );
        } catch (error) {
          console.error(`[${SIGNUP_VERSION}] unexpected_error`, error);

          return Response.json(
            {
              success: false,
              version: SIGNUP_VERSION,
              stage: "unexpected",
              code: "UNEXPECTED_SIGNUP_ERROR",
              userMessage: "Ocorreu uma falha inesperada durante o cadastro.",
              technicalMessage: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
