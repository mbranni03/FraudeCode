import log from "@/utils/logger";
import { BunApiRouter } from "@/utils/router";
import Agent from "@/agent/agent";
import { Settings, UpdateSettings } from "@/config/settings";
import init from "./src/init";
import OpenFEC from "./src/services/openFEC";
import { getMemberById } from "./src/services/congressData";
import LegislatorDict from "./src/services/legislatorDict";

const command = {
  name: "election-helper",
  description: "Election Helper",
  usage: "/election-helper",
  action: async () => {
    const router = new BunApiRouter();
    await init();
    router.register("GET", "/", (req) => {
      return new Response("Hello World", {
        headers: { "Content-Type": "text/plain" },
      });
    });

    router.register("GET", "/elections", async (req) => {
      const response = await fetch(
        "https://www.googleapis.com/civicinfo/v2/elections?key=" +
          process.env.GOOGLE_API_KEY,
      );
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    });

    router.register("GET", "/candidates", async (req) => {
      const data = await OpenFEC.getInstance().getAllCandidates();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    });

    router.register("GET", "/candidates/:state", async (req) => {
      const state = req.params.state!;
      const url = new URL(req.url);
      const office = url.searchParams.get("office") as "H" | "S" | "P" | null;
      const district = url.searchParams.get("district");
      const data = await OpenFEC.getInstance().getStateCandidates(
        state,
        office || undefined,
        district || undefined,
      );
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    });

    await router.serve(3000);
  },
};

export default command;
