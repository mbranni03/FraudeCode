import log from "@/utils/logger";
import { BunApiRouter } from "@/utils/router";

const command = {
  name: "learn",
  description: "Code Learning Platform",
  usage: "/learn",
  action: async () => {
    const router = new BunApiRouter();
    router.register("GET", "/", (req) => {
      return new Response("Hello World");
    });
    await router.serve(3000);
  },
};

export default command;
