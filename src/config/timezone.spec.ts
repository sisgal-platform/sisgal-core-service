describe('zona horaria del proceso', () => {
  const zonaOriginal = process.env.TZ;

  afterEach(() => {
    process.env.TZ = zonaOriginal;
  });

  it('fija la zona de Colombia al importarse', () => {
    process.env.TZ = 'UTC';

    jest.isolateModules(() => {
      require('./timezone');
    });

    expect(process.env.TZ).toBe('America/Bogota');
  });
});
