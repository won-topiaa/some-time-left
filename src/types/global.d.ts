/** metro 번들러가 제공하는 require.context. */
declare namespace NodeJS {
  interface Require {
    context(
      directory: string,
      useSubdirectories?: boolean,
      regExp?: RegExp
    ): {
      keys(): string[];
      (id: string): any;
      <T>(id: string): T;
      resolve(id: string): string;
      id: string;
    };
  }
}
