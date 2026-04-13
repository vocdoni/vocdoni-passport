export type AppBuildInfo = {
  version: string;
  gitRef: string;
  gitRefKind: 'tag' | 'commit';
};

export const APP_BUILD_INFO: AppBuildInfo = {
  version: '1.0',
  gitRef: '500ebb3',
  gitRefKind: 'commit',
};
