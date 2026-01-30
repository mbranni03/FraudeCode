import log from "@/utils/logger";

const command = {
  name: "hello-plugin",
  description: "A sample plugin command",
  usage: "/hello-plugin <name>",
  action: (args: string[]) => {
    log("Hello from plugin! Args:", args.join(", "));
  },
};

export default command;
