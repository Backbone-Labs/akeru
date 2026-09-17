export const sources = {
  engine: {
    url: 'https://github.com/libretro/libretro-prboom',
    revision: 'ddea2c6c041f7790c7bcf1dc3c1fe73b6cff0516',
    archiveSha256:
      'f79455e79055c11861e258089a554d45d074a3facc7ab7e0b0c9cfe9747c9e0c',
    declaredLicense: 'GPL-2.0',
  },
  data: {
    url: 'https://github.com/freedoom/freedoom',
    revision: 'd14dbbee3b6fbfb2c11cdb65eb61216e86d4ee85',
    archiveSha256:
      '1622b94b99bbd67e4fd165ab37dccdbe24d1a45bb092e873c95f7887a0978688',
    declaredLicense: 'BSD-3-Clause',
  },
};
export const editions = {
  freedoom1: { title: 'Freedoom: Phase 1', mode: 'single-player campaign' },
  freedoom2: { title: 'Freedoom: Phase 2', mode: 'single-player campaign' },
  freedm: {
    title: 'FreeDM',
    mode: 'solo map practice; no opponents or network',
  },
};
