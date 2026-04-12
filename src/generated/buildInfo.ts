export type AppBuildInfo = {
  version: string;
  gitRef: string;
  gitRefKind: 'tag' | 'commit';
};

export const APP_BUILD_INFO: AppBuildInfo = {
  version: '0.1.0',
  gitRef: '32f8a83',
  gitRefKind: 'commit',
};
