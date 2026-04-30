export type CodexProcessSpec = {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
};

export function buildCodexProcess(bin: string, args: string[]): CodexProcessSpec {
  if (process.platform !== 'win32') return { command: bin, args };

  const lower = bin.toLowerCase();
  if (lower.endsWith('.ps1')) {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bin, ...args],
    };
  }
  if (lower.endsWith('.cmd')) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', ['call', quoteCmdArg(bin), ...args.map(quoteCmdArg)].join(' ')],
      windowsVerbatimArguments: true,
    };
  }
  return { command: bin, args };
}

function quoteCmdArg(arg: string): string {
  if (!/[()\s!%&^<>"|]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}
