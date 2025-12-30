declare module 'node-pty' {
  export interface IPty {
    pid: number;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    on(event: 'data', listener: (data: string) => void): void;
    on(event: 'exit', listener: (exitCode: number, signal?: number) => void): void;
  }

  export interface IWindowsPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: { [key: string]: string };
    useConpty?: boolean;
  }

  export function spawn(
    file: string,
    args: string[] | string,
    options: IWindowsPtyForkOptions
  ): IPty;
}
