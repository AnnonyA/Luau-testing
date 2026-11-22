# Tovek Studio

Decompilador de bytecode Luau, basado en [Tovek](https://github.com/Kiet1308/Tovek). Incluye una interfaz web local, CLI y API HTTP.

## Empezar

Necesitas Git y Rust con `rustup`. El proyecto usa la versión fijada en `rust-toolchain.toml`.

```sh
cargo run --release -p web-server
```

Abre **http://127.0.0.1:3000**. Carga bytecode Luau (máximo 16 MiB), elige su origen y decompílalo. Puedes copiar o descargar el resultado. El archivo se envía al servidor que sirve la página; si ejecutas el servidor en tu equipo, se queda allí.

Para usar la CLI:

```sh
cargo run --release -p luau-lifter -- --help
```

El servidor también ofrece `POST /decompile/raw` (bytecode binario), `POST /decompile` (base64) y `POST /decompile/batch`. Los clientes Luau están en la raíz del repositorio.

## Pruebas

```sh
cargo test --workspace --all-targets
python3 -m unittest discover -s scripts -p 'test_*.py'
node --test web-server/ui/studio.test.mjs
```

Para trabajar solo en la interfaz, `node web-server/ui/dev-server.mjs` abre una vista en el puerto 4173 y redirige las solicitudes al servidor Rust local en el puerto 3000. La decompilación requiere que ese servidor esté en marcha.

## Roadmap

- [x] Interfaz web para un archivo, con copia y descarga.
- [ ] Comparativa reproducible de calidad y rendimiento.
- [ ] Límites de tiempo y memoria por archivo.
- [ ] Reducir los rechazos de flujo de control, llamadas abiertas y `SETLIST`.
- [ ] Recuperar más nombres y tipos con evidencia confiable.
- [ ] Procesamiento por lotes desde la interfaz.

La decompilación no garantiza recuperar el código original. Los casos no demostrablemente seguros se rechazan en lugar de producir Luau inválido.

## Créditos y licencia

Fork de [Kiet1308/Tovek](https://github.com/Kiet1308/Tovek), derivado de medal. Consulta [LICENSE.txt](LICENSE.txt).
