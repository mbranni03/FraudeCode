import { homedir } from "os";

export const shortenPath = (path: string) => {
  const home = homedir();
  if (path.startsWith(home)) {
    return path.replace(home, "~");
  }
  return path;
};

export const projectPath = (path: string) => {
  const base = process.cwd();
  if (path.startsWith(base)) {
    return path.replace(base, "@");
  }
  return path;
};
