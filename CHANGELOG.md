# Changelog

## [0.9.1](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.9.0...standcast-v0.9.1) (2026-11-08)


### Bug Fixes

* serve the install script from the landing ([e009c0f](https://github.com/ImFelipeOliveira/standcast/commit/e009c0ff546093f7ef63a38aff3ec935f76cd189))
* serve the install script from the landing ([#127](https://github.com/ImFelipeOliveira/standcast/issues/127)) ([5d49e46](https://github.com/ImFelipeOliveira/standcast/commit/5d49e46929b4ec065f2bf0f901f8444611ab6b3c))
* show a progress bar while the install script downloads ([44effd4](https://github.com/ImFelipeOliveira/standcast/commit/44effd4d687e6f60ee4095968857cc527f1f48f2))

## [0.9.0](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.8.2...standcast-v0.9.0) (2026-11-08)


### Features

* **config:** accept GitHub teams in managers ([#100](https://github.com/ImFelipeOliveira/standcast/issues/100)) ([947d8b0](https://github.com/ImFelipeOliveira/standcast/commit/947d8b0124815570a88d57e825c42ce3ea622110))


### Bug Fixes

* **access:** resolve managed teams before the admin check ([dcb59bd](https://github.com/ImFelipeOliveira/standcast/commit/dcb59bd44b96aa131ad2c584430a827a126084be))
* **blockers:** retry routing when a manager team is unavailable ([625d307](https://github.com/ImFelipeOliveira/standcast/commit/625d3078cdb4ad037b8b8a72b7de2c427bf2b864))
* **config:** reject "." and ".." as GitHub team slugs ([ffdb2eb](https://github.com/ImFelipeOliveira/standcast/commit/ffdb2eba959a1061935813d570ecfd3f23a7e800))
* **docs:** serve the favicon at /favicon.svg ([0d45bc4](https://github.com/ImFelipeOliveira/standcast/commit/0d45bc4bac452d247d2f6d043cb4dcdedd13cefa))
* **docs:** serve the favicon at /favicon.svg ([#117](https://github.com/ImFelipeOliveira/standcast/issues/117)) ([a541422](https://github.com/ImFelipeOliveira/standcast/commit/a5414227b2aea6eef933506eb2e2e49b075fe95f))
* **site:** serve a png favicon and retitle the portuguese home ([fafa31b](https://github.com/ImFelipeOliveira/standcast/commit/fafa31be922dabd48ed1f67230622f023fa578e6))
* **site:** serve a png favicon and retitle the portuguese home ([#118](https://github.com/ImFelipeOliveira/standcast/issues/118)) ([32b83bc](https://github.com/ImFelipeOliveira/standcast/commit/32b83bc44d15cb34016c92a96a53e806016316b8))
* **teams:** bound team reads and keep member paths off manager teams ([373be68](https://github.com/ImFelipeOliveira/standcast/commit/373be68995915bcf170c3290a469e17293a6e972))
* **teams:** keep member resolution off manager team listings ([403b5e9](https://github.com/ImFelipeOliveira/standcast/commit/403b5e93c26fda014ea82adcd8352962dd26344c))
* **teams:** share in-flight team reads and time out each page ([3e768e4](https://github.com/ImFelipeOliveira/standcast/commit/3e768e4b6fef074d7b0aeceae661ebd54347bfa1))


### Refactoring

* share withDeadline between guarded and the Google Chat membership check ([0cc8530](https://github.com/ImFelipeOliveira/standcast/commit/0cc8530b4161e5735ed4797fafc31e9c7c13811f))

## [0.8.2](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.8.1...standcast-v0.8.2) (2026-11-07)


### Bug Fixes

* accept an empty product release and a real funding link ([729b639](https://github.com/ImFelipeOliveira/standcast/commit/729b63956fa04b4c232aeb80910be8fbd8e8d325))
* accept an empty product release and a real funding link ([#113](https://github.com/ImFelipeOliveira/standcast/issues/113)) ([2e1d653](https://github.com/ImFelipeOliveira/standcast/commit/2e1d653d8321514b89fd10bc7975195ad1f07e5e))
* **test:** retry a deadlocked truncate of the shared test database ([17c9520](https://github.com/ImFelipeOliveira/standcast/commit/17c9520f6bdbb2c38071823a409895af783a3e65))
* **test:** retry a deadlocked truncate of the shared test database ([#112](https://github.com/ImFelipeOliveira/standcast/issues/112)) ([4f977d5](https://github.com/ImFelipeOliveira/standcast/commit/4f977d5431051a2174b3606584d523a4dd0f48b5))
* treat star and plus changelog bullets as notes ([7e40186](https://github.com/ImFelipeOliveira/standcast/commit/7e40186d9ef1832cf4d701acbc6cbde1c4d70074))

## [0.8.1](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.8.0...standcast-v0.8.1) (2026-11-07)


### Bug Fixes

* keep standcast.yml private and name the beta testers ([#103](https://github.com/ImFelipeOliveira/standcast/issues/103)) ([54f8bad](https://github.com/ImFelipeOliveira/standcast/commit/54f8bad65dee438efe8784925af604e3edd620df))

## [0.8.0](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.7.0...standcast-v0.8.0) (2026-11-07)


### Features

* **api:** redirect /setup to the web app ([b2c4b0d](https://github.com/ImFelipeOliveira/standcast/commit/b2c4b0d78a5d3dbad781147cdd3583c0f7c744a7))
* **api:** remove the server-rendered setup page ([aeecfcc](https://github.com/ImFelipeOliveira/standcast/commit/aeecfcc3205c3aabb2092c80193fd26ec1c4baef))
* move setup from the API to the web app ([#92](https://github.com/ImFelipeOliveira/standcast/issues/92)) ([73c5445](https://github.com/ImFelipeOliveira/standcast/commit/73c5445830f8ec7f3025f5388ac701d5c5fd9473))
* send Slack and Linear connect back to Configuração ([1c5e99f](https://github.com/ImFelipeOliveira/standcast/commit/1c5e99f61929930a83f9d0a8078f321943bfe521))
* **web:** hold a new installation on /setup instead of the home page ([471eede](https://github.com/ImFelipeOliveira/standcast/commit/471eede778c06197bd01526e7d3d4c6cf44540ac))


### Bug Fixes

* **api:** redirect every /setup request to the web app ([0450103](https://github.com/ImFelipeOliveira/standcast/commit/0450103e4940f911297c5f9cc8b85ae417b0413b))
* bake the hosted API origin into the web build ([b4fe2a0](https://github.com/ImFelipeOliveira/standcast/commit/b4fe2a035d81b109ccf5ebf216320a991b004a21))
* **cli:** harden labeled credential redaction ([c663496](https://github.com/ImFelipeOliveira/standcast/commit/c663496cfd084f9e7970188c290de57e3665c38c))
* **cli:** redact escaped quoted secrets ([aaab800](https://github.com/ImFelipeOliveira/standcast/commit/aaab8007dc51eb0aa19c988c09cabfd3c1d408ee))
* **cli:** redact escaped quoted secrets ([#86](https://github.com/ImFelipeOliveira/standcast/issues/86)) ([3de1750](https://github.com/ImFelipeOliveira/standcast/commit/3de1750222a8b2e26c21aa6d3c6f50ac93cdccb3))
* **cli:** redact escaped unquoted credentials ([05f086b](https://github.com/ImFelipeOliveira/standcast/commit/05f086bf08eac067bf00c072782f4c933f6c549d))
* **cli:** redact text after encoded internal quotes ([c822dd7](https://github.com/ImFelipeOliveira/standcast/commit/c822dd7618b714f8f76bb7f5b1a29cf8ef9ee972))
* show standcast.app on the social banner ([3b73705](https://github.com/ImFelipeOliveira/standcast/commit/3b73705d1bb0c73d95faf6e208ce779a247fda48))
* show standcast.app on the social banner ([#95](https://github.com/ImFelipeOliveira/standcast/issues/95)) ([0adb642](https://github.com/ImFelipeOliveira/standcast/commit/0adb642978f95a43a75272909ef6ebd52cc54e3e))


### Refactoring

* **orchestrator:** group use cases into modules ([06c53e6](https://github.com/ImFelipeOliveira/standcast/commit/06c53e669d84092e22528e103074c1b12bed3489))
* **orchestrator:** group use cases into modules ([#89](https://github.com/ImFelipeOliveira/standcast/issues/89)) ([9f82aef](https://github.com/ImFelipeOliveira/standcast/commit/9f82aefa9b789db8ee70fbe70c147f44c774bd05))
* **orchestrator:** keep GitHub installation memory in the github module ([ae29f7c](https://github.com/ImFelipeOliveira/standcast/commit/ae29f7cb1c184856b0685504672f672ef7ad4d96))

## [0.7.0](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.6.0...standcast-v0.7.0) (2026-11-06)


### Features

* **landing:** animated halftone ([#83](https://github.com/ImFelipeOliveira/standcast/issues/83)) ([753890c](https://github.com/ImFelipeOliveira/standcast/commit/753890cfb35ffe880445f335c2478da00a7c9afd))
* **landing:** animated halftone field behind the home hero ([9768d8b](https://github.com/ImFelipeOliveira/standcast/commit/9768d8bfcaaf5303a1e5ac367dfe8295d39c9cbe))
* **landing:** animated halftone field, vertical day timeline and clear header ([#82](https://github.com/ImFelipeOliveira/standcast/issues/82)) ([84a18d4](https://github.com/ImFelipeOliveira/standcast/commit/84a18d4dddbf6772f697900349a5301c268d6aef))
* **landing:** field always on screen, softer and readable ([2d5b169](https://github.com/ImFelipeOliveira/standcast/commit/2d5b169d5ac081844af8291fdf1f5ba17ea9b387))
* **landing:** field spreads across the whole hero ([4bbeb3e](https://github.com/ImFelipeOliveira/standcast/commit/4bbeb3e4fc145ef268cf395a8f4f8d803652beb9))
* **landing:** soft scrim keeps the hero copy readable over the field ([ec14e16](https://github.com/ImFelipeOliveira/standcast/commit/ec14e16e9f5fce839fbd1b4cd56f76060caac829))
* **landing:** webgl halftone field, vertical day timeline, clear header and scroll reveals ([9e7cf47](https://github.com/ImFelipeOliveira/standcast/commit/9e7cf47e50d4d453cdda5474526d45a68db680d9))


### Bug Fixes

* **landing:** guard observers, timeline script on how it works, mobile scrim ([b08b311](https://github.com/ImFelipeOliveira/standcast/commit/b08b31131c0514c85ec829cdb8839e864947f8d1))

## [0.6.0](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.5.0...standcast-v0.6.0) (2026-11-06)


### Features

* refreshed banner and automatic release changelog headings ([#78](https://github.com/ImFelipeOliveira/standcast/issues/78)) ([1b34ea6](https://github.com/ImFelipeOliveira/standcast/commit/1b34ea62ab64ba8cda5ec2b82d281d79aab62cf4))
* refreshed banner with google chat, agents and beta ([5510397](https://github.com/ImFelipeOliveira/standcast/commit/5510397856b07361ef2336a0cbc00ef664fc4623))
* refreshed banner with google chat, agents and beta ([#77](https://github.com/ImFelipeOliveira/standcast/issues/77)) ([5906c12](https://github.com/ImFelipeOliveira/standcast/commit/5906c122e5ba1ee2e4fc5a6c97d46cf7714cfd8c))

## [0.5.0](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.4.1...standcast-v0.5.0) (2026-11-06)


### Features

* google chat ([#66](https://github.com/ImFelipeOliveira/standcast/issues/66)) ([dbac777](https://github.com/ImFelipeOliveira/standcast/commit/dbac777bb8173d614b15282276650c8692c887b2))
* google chat adapter ([b9c6c60](https://github.com/ImFelipeOliveira/standcast/commit/b9c6c60cf080939d31d74151818c21e43c72380b))
* google chat spaces, link codes and identities ([0241f11](https://github.com/ImFelipeOliveira/standcast/commit/0241f11a32c06336e7405977ab73cc25e8874e1a))
* google chat webhook and link routes ([7673cc6](https://github.com/ImFelipeOliveira/standcast/commit/7673cc67d44a6ddefff0750d7291954df1d98c6a))
* google chat, landing pages and search previews ([#68](https://github.com/ImFelipeOliveira/standcast/issues/68)) ([94b3f63](https://github.com/ImFelipeOliveira/standcast/commit/94b3f63649024d3f8913625d8a09bf0ba9a8a2ae))
* **google-chat:** tell people their Google Chat id when the email does not match ([57af136](https://github.com/ImFelipeOliveira/standcast/commit/57af136fc3979ec5cc9522bd5b213e690746bb1a))
* **landing:** portuguese 404 page for /pt-BR/ paths ([b38269f](https://github.com/ImFelipeOliveira/standcast/commit/b38269fb3dbda0e22cbfe6a1d9d2f60a6f7716b8))
* **landing:** separate pages for sitelinks ([8cc35a7](https://github.com/ImFelipeOliveira/standcast/commit/8cc35a7ce206707768c8acec20cbbf29eb5c90cf))
* **landing:** separate pages for sitelinks ([#64](https://github.com/ImFelipeOliveira/standcast/issues/64)) ([6ce0755](https://github.com/ImFelipeOliveira/standcast/commit/6ce0755beea981e9a3d8fb2692045da788c88237))
* large image previews for search and social ([f4ca658](https://github.com/ImFelipeOliveira/standcast/commit/f4ca6585356ca010470047c2abb74deecc63eed6))
* large image previews for search and social ([#67](https://github.com/ImFelipeOliveira/standcast/issues/67)) ([03dbc9d](https://github.com/ImFelipeOliveira/standcast/commit/03dbc9d0e9f31c96a46fa9edf4314b93ac05648e))
* marketplace listing assets and terms of use ([f47b922](https://github.com/ImFelipeOliveira/standcast/commit/f47b9220f8537d452d75432e5fc4630f10341f93))
* marketplace listing assets and terms of use ([#69](https://github.com/ImFelipeOliveira/standcast/issues/69)) ([c866419](https://github.com/ImFelipeOliveira/standcast/commit/c866419b12a9ee0fc29d162be811ef63c598f7d3))
* **web:** google chat connection ([d9edff8](https://github.com/ImFelipeOliveira/standcast/commit/d9edff8790556a79429d69e345f713418d33f641))


### Bug Fixes

* address coderabbit review of google chat ([259ac4c](https://github.com/ImFelipeOliveira/standcast/commit/259ac4cdca29e9314bdcda3b3cf49dd4a9a505ca))
* address coderabbit review of the dev to main pr ([7702818](https://github.com/ImFelipeOliveira/standcast/commit/77028182ce6622e5ea0470dcce05415eea9c4ddb))
* address coderabbit review of the dev to main pr ([#71](https://github.com/ImFelipeOliveira/standcast/issues/71)) ([db9eb86](https://github.com/ImFelipeOliveira/standcast/commit/db9eb862171bd8096a59b6679e97e2460d786979))
* **api:** invalid beta requests return to the home notice, safe in any deploy order ([9311220](https://github.com/ImFelipeOliveira/standcast/commit/9311220f8814d90dd186ce16a3b7f2e41ad80e41))
* **api:** send invalid beta requests back to the beta page ([f9ed04c](https://github.com/ImFelipeOliveira/standcast/commit/f9ed04c1a2dcc33842987a4b4358eaf3cd487e56))
* check every linked space, precise override docs ([64b2a77](https://github.com/ImFelipeOliveira/standcast/commit/64b2a7757ccffc4573e970aaa225ed7263725f86))
* codeql alerts on url trimming and html id parsing ([90864fa](https://github.com/ImFelipeOliveira/standcast/commit/90864fac27f8bbb86a286e3b758817a0cefb309b))
* codeql alerts on url trimming and html id parsing ([#70](https://github.com/ImFelipeOliveira/standcast/issues/70)) ([49000ef](https://github.com/ImFelipeOliveira/standcast/commit/49000effbebbe422cee7b467db6e43e468f8a7ec))
* **config:** require a Google Chat space name as a google-chat team channel ([b7fbca8](https://github.com/ImFelipeOliveira/standcast/commit/b7fbca8370700c71d538e3b3ee553d6964721588))
* empty google chat audience means default, install anchors ([33fca67](https://github.com/ImFelipeOliveira/standcast/commit/33fca670937dfd5efd2b3252a0d8f33f06229611))
* fourth coderabbit pass on google chat ([a7283b2](https://github.com/ImFelipeOliveira/standcast/commit/a7283b264e81f80c86c13c4e6e1b0ee50b659789))
* google chat adapter review findings ([5643a15](https://github.com/ImFelipeOliveira/standcast/commit/5643a15d3161f4762b8ad57965f7fc383448dcd8))
* google chat final review findings ([a03b44e](https://github.com/ImFelipeOliveira/standcast/commit/a03b44ecd14f5ae275e9a01ce0a83b9c3ac9600b))
* google chat spaces review findings ([037a7c7](https://github.com/ImFelipeOliveira/standcast/commit/037a7c7fd6a7d91c054919f3f5e763c0ae0f95f6))
* google chat webhook review findings ([ba952d8](https://github.com/ImFelipeOliveira/standcast/commit/ba952d85112416d9dd9fe9ee99aea2e5adebe631))
* **google-chat:** space name in chat.channel and Google Chat id when the email does not match ([#72](https://github.com/ImFelipeOliveira/standcast/issues/72)) ([dac06fe](https://github.com/ImFelipeOliveira/standcast/commit/dac06fecf70c76afd9e8ff5dccef55ee382e044c))
* **landing:** hero terminal lines no longer double spaced, retake screenshots ([561899a](https://github.com/ImFelipeOliveira/standcast/commit/561899a8250b78afaf2e1326e106714086756f7d))
* **landing:** organization description reads naturally ([3ea51d1](https://github.com/ImFelipeOliveira/standcast/commit/3ea51d1e9cd6c9f1adc966b871f0e9d06bc47ee7))
* **landing:** organization schema and plain definition for search and AI engines ([#57](https://github.com/ImFelipeOliveira/standcast/issues/57)) ([82d1c94](https://github.com/ImFelipeOliveira/standcast/commit/82d1c942197ff04cc5afd3bf6d84ce790f3f4e08))
* **landing:** organization schema, plain definition and shorter pt-BR description ([0951fb4](https://github.com/ImFelipeOliveira/standcast/commit/0951fb4a21c4c592dc8d695aa30b5605bdce38de))
* second coderabbit pass on google chat ([dd6ad07](https://github.com/ImFelipeOliveira/standcast/commit/dd6ad079560f09bb106b9cdfe5c7bccdb5eb105a))
* third coderabbit pass on google chat ([4a04810](https://github.com/ImFelipeOliveira/standcast/commit/4a04810fcab227421529c65dd9bf7e2a02f3ac49))
* **web:** google chat review findings ([c7b2c99](https://github.com/ImFelipeOliveira/standcast/commit/c7b2c99a03b9b65d4503d795ec6f094be5fe659f))


### Refactoring

* provider-neutral chat wiring ([0eec48c](https://github.com/ImFelipeOliveira/standcast/commit/0eec48c2b250d6b3de4c2799dd31d8b2a389ec90))

## [0.4.1](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.4.0...standcast-v0.4.1) (2026-11-02)


### Documentation

* 0.4.0 changelog entries ([65d4618](https://github.com/ImFelipeOliveira/standcast/commit/65d46181261868d600e459a5965f6978eee67fba))
* 0.4.0 changelog entries ([#52](https://github.com/ImFelipeOliveira/standcast/issues/52)) ([6f15c49](https://github.com/ImFelipeOliveira/standcast/commit/6f15c49f75138b0447b61af73d301db006893687))

## [0.4.0](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.3.1...standcast-v0.4.0) (2026-11-02)


### Features

* **api:** session, cors and csrf for the web app ([6e6ec43](https://github.com/ImFelipeOliveira/standcast/commit/6e6ec43173c1b695979821f72268e9af738a4f63))
* **api:** setup endpoints for the web app ([a2317ba](https://github.com/ImFelipeOliveira/standcast/commit/a2317ba1e24c28073a7251b31b957f0bb2d9c186))
* **api:** web login can return to the app ([8bbede2](https://github.com/ImFelipeOliveira/standcast/commit/8bbede2bc957ac2139288f7824313fe304a86b62))
* ask for support requests in the MCP server, CLI and /daily skill ([294a63a](https://github.com/ImFelipeOliveira/standcast/commit/294a63a8b61fadfdf5d7c7864d076c0812da273e))
* blocker states with age, resolve and reopen ([238aa20](https://github.com/ImFelipeOliveira/standcast/commit/238aa20c46fa1eba9ddeafbd9e0b459db870d2ab))
* **cli:** cross-reference sessions, pull requests and cards into work items ([db0f612](https://github.com/ImFelipeOliveira/standcast/commit/db0f612e925d9ed6e6fdefe927103763a1ce1b65))
* **cli:** read local claude code sessions for the draft ([04daf1f](https://github.com/ImFelipeOliveira/standcast/commit/04daf1f95d7409ae58ca42fbc2fac37e9de5d169))
* emoji section labels in the digest ([d15beb0](https://github.com/ImFelipeOliveira/standcast/commit/d15beb069aa7a3e476e0e094969e0f28e757befa))
* hoje screen with blocker states and support requests (phase 2b) ([#47](https://github.com/ImFelipeOliveira/standcast/issues/47)) ([1ebe2dc](https://github.com/ImFelipeOliveira/standcast/commit/1ebe2dca3acabb4e1de4b0988e4eba780d3d8df0))
* pull request head branch in the draft activity ([4bd3a07](https://github.com/ImFelipeOliveira/standcast/commit/4bd3a07e84d07bd0c79925580dfc49233a6a636e))
* support requests in the daily and the digest ([667ad30](https://github.com/ImFelipeOliveira/standcast/commit/667ad302eb4ea7e715eb1ac1118ebbc6907a5a0c))
* the daily draft uses local ai sessions ([00b96e9](https://github.com/ImFelipeOliveira/standcast/commit/00b96e973688563a590becf365e022dc20cb1393))
* the daily draft uses local ai sessions (phase 2a+) ([#46](https://github.com/ImFelipeOliveira/standcast/issues/46)) ([691c4e3](https://github.com/ImFelipeOliveira/standcast/commit/691c4e3c18f44bf2b4a5b3860eba517e7a395947))
* today use case and endpoints for the web app ([ef18d7c](https://github.com/ImFelipeOliveira/standcast/commit/ef18d7c4fd72b8f994e89c41e7a992ed5d9f6a18))
* web and draft sessions ([#48](https://github.com/ImFelipeOliveira/standcast/issues/48)) ([c1c96ed](https://github.com/ImFelipeOliveira/standcast/commit/c1c96ed4886716168e86529c60110c94e0810ff0))
* web app foundation and configuração (phase 2a) ([#45](https://github.com/ImFelipeOliveira/standcast/issues/45)) ([c08d8bb](https://github.com/ImFelipeOliveira/standcast/commit/c08d8bbd3aa3dc4290362daf4b2b275eef74f4a5))
* **web:** app workspace with theme, i18n and deploy config ([6678a20](https://github.com/ImFelipeOliveira/standcast/commit/6678a20b1dc3b8362db066a840c6ff53a62fdf4c))
* **web:** configuração screen ([0edb51e](https://github.com/ImFelipeOliveira/standcast/commit/0edb51e2bee1882e384b25bb42ef706451b6ef24))
* **web:** hoje screen ([aa1927d](https://github.com/ImFelipeOliveira/standcast/commit/aa1927d08ffe4be632abb4c651201167ec93f80b))
* **web:** shell, api client, sign-in guard and org switcher ([d2b75e9](https://github.com/ImFelipeOliveira/standcast/commit/d2b75e9050d094f06c348f35420c744bec851657))


### Bug Fixes

* address coderabbit review of the draft from sessions ([a96d4e8](https://github.com/ImFelipeOliveira/standcast/commit/a96d4e8183c39a2db40dc89efbc985796013547c))
* address coderabbit review of the today screen ([0e8c0bd](https://github.com/ImFelipeOliveira/standcast/commit/0e8c0bd9d4fdc667148c92d4b2627b353749a941))
* address coderabbit review of the web app foundation ([636bcc4](https://github.com/ImFelipeOliveira/standcast/commit/636bcc4e2ee2b9e699bbb74f7de08e8c65ec846d))
* cleaner digest links, deduped draft PRs and a setup warning for missing Slack channels ([37c067a](https://github.com/ImFelipeOliveira/standcast/commit/37c067a7b879cd266d20704f66753a710035fddb))
* cleaner digest links, deduped draft PRs and a setup warning for missing Slack channels ([#44](https://github.com/ImFelipeOliveira/standcast/issues/44)) ([b84c6a9](https://github.com/ImFelipeOliveira/standcast/commit/b84c6a9a66acba9e2c79a2e9dd4a6b15fc75f9ba))
* **cli:** entropy-based catch-all redaction ([c954dbb](https://github.com/ImFelipeOliveira/standcast/commit/c954dbb21954a69ffc2f4e2d3800ad8d5bee397d))
* **cli:** keep ticket-style names visible in redaction ([2007ba6](https://github.com/ImFelipeOliveira/standcast/commit/2007ba623b7f8cb5de8e859baef1e514b81d0804))
* **cli:** match prefixed and quoted credential labels in redaction ([3e46141](https://github.com/ImFelipeOliveira/standcast/commit/3e461412305d2bf76bd66459fbe6b53d41283ba7))
* **cli:** read the tail of large session files and tighten redaction ([951500d](https://github.com/ImFelipeOliveira/standcast/commit/951500d41a0417e542c7db95be99cf42d5fd8e92))
* **cli:** redact values after credential labels ([4863e97](https://github.com/ImFelipeOliveira/standcast/commit/4863e974e8a6ca058360fdbf038ece77b6225f70))
* **cli:** redact whole runs with random segments ([2c4924c](https://github.com/ImFelipeOliveira/standcast/commit/2c4924cc093d87b7ca5188cbb284b9f2c27ac088))
* **cli:** segment-level redaction in paths and urls ([d593ab8](https://github.com/ImFelipeOliveira/standcast/commit/d593ab8acd0fa99e603ef05f1105cfbd5a38549b))
* **cli:** skip harness lines in session prompts ([7aea0af](https://github.com/ImFelipeOliveira/standcast/commit/7aea0afe6722d0d6d0aab18f63ca8074c3591cbe))
* **cli:** stricter path detection in redaction ([da61402](https://github.com/ImFelipeOliveira/standcast/commit/da61402f3085993e478f1442ea5b8328bc5ec71d))
* final review fixes for the draft from sessions ([dd638ef](https://github.com/ImFelipeOliveira/standcast/commit/dd638ef8abd95e3ec8c0b3caa0df6a79866288e0))
* final review fixes for the today screen ([7f8d217](https://github.com/ImFelipeOliveira/standcast/commit/7f8d2175ecc7005861f72c945222f114b862ad22))
* final review fixes for the web app foundation ([f552b72](https://github.com/ImFelipeOliveira/standcast/commit/f552b72076e357c6932b430bd5f4fc3374626709))
* keep sessions on the org retry and bound the url credentials regex ([766ea8d](https://github.com/ImFelipeOliveira/standcast/commit/766ea8dd291a84097bd7254fe4efcfbb099ed251))
* per-channel timeout for slack channel checks ([e9a4bbf](https://github.com/ImFelipeOliveira/standcast/commit/e9a4bbfa7d16da131f7bc55f275e04919dc5b4dc))
* remind now only on the team's workday ([9bc4356](https://github.com/ImFelipeOliveira/standcast/commit/9bc43560fd996a41cb8fabebfdf9be8d524a2054))
* share in-flight Slack channel listing and keep channel notices when one check fails ([912ff58](https://github.com/ImFelipeOliveira/standcast/commit/912ff583fa823e23aa0e540c7011b5c5585ed51f))
* **web:** hoje polish ([b4a7492](https://github.com/ImFelipeOliveira/standcast/commit/b4a7492fc56119a79bc582b58c18f7db73af1f45))
* **web:** signed-out page and app-owned /setup ([e0baf54](https://github.com/ImFelipeOliveira/standcast/commit/e0baf543a6004f448bd467d1d26c6c58a122339e))


### Documentation

* app url is required ([d559c73](https://github.com/ImFelipeOliveira/standcast/commit/d559c73ddb6115abe904ac065bf9ca3e4d8f1ba3))
* draft from ai sessions design and plan ([14ca12c](https://github.com/ImFelipeOliveira/standcast/commit/14ca12c2d1aef95b39161a2a2bad8e2dbebc847d))
* draft from ai sessions right after phase 2a ([6fa5204](https://github.com/ImFelipeOliveira/standcast/commit/6fa5204713fc12779034b2e91744bd46bf052df1))
* email digest design ([4d3fcfb](https://github.com/ImFelipeOliveira/standcast/commit/4d3fcfb7e695ffb7e0ba1440a4e841392a264ddc))
* email digest moves to phase 2 with the web app ([db9f52d](https://github.com/ImFelipeOliveira/standcast/commit/db9f52d34735aa0f0b0975797ea935e2867dbc1f))
* github app homepage url in the deploy checklist ([d35c35c](https://github.com/ImFelipeOliveira/standcast/commit/d35c35ce4f6c28ad2b9a01e10c043e71b20baa81))
* hoje screen and web app page ([5c33b23](https://github.com/ImFelipeOliveira/standcast/commit/5c33b23d17c0c830e8337b5733745fb706d0aaed))
* phase 2 web app design ([c8c1e49](https://github.com/ImFelipeOliveira/standcast/commit/c8c1e49afc1f6f038a4891ff746cc28053655d09))
* phase 2a plan, web app foundation and configuração ([c716742](https://github.com/ImFelipeOliveira/standcast/commit/c7167424a88b48cb894c1f52a51072ce37be430e))
* phase 2b plan, today screen ([2d736ff](https://github.com/ImFelipeOliveira/standcast/commit/2d736ff2106c25254d49de3d7a53d4d3a5843fc0))
* support requests ([93a0172](https://github.com/ImFelipeOliveira/standcast/commit/93a0172bca2f86f4adf9261176f82925baced3b1))
* support requests design ([189ab9c](https://github.com/ImFelipeOliveira/standcast/commit/189ab9c5ed37570c6e46127385812fcb026ff6b9))
* the app and the api must move to the same site together ([43c08f0](https://github.com/ImFelipeOliveira/standcast/commit/43c08f0208145e634f35eb37e70b5eb35194db1a))


### Refactoring

* **web:** type team notices exhaustively now that channel kinds are in core ([d851c3d](https://github.com/ImFelipeOliveira/standcast/commit/d851c3d154bae96e334a0cd68752f4baedd00618))

## [0.3.1](https://github.com/ImFelipeOliveira/standcast/compare/standcast-v0.3.0...standcast-v0.3.1) (2026-11-01)


### Bug Fixes

* changelog dates must be real calendar dates; cover a missing changelog file ([fb10e1f](https://github.com/ImFelipeOliveira/standcast/commit/fb10e1fdda563a085f1378fb2fa41d6d2d5bb3a7))
* changelog headings need a dated entry; one missing changelog fails the check ([de1bab0](https://github.com/ImFelipeOliveira/standcast/commit/de1bab0bae7ef88fb74bc60720702b496541b70d))
* content-hashed font files, clean docs urls in the sitemap, stricter font tests ([3b58252](https://github.com/ImFelipeOliveira/standcast/commit/3b58252133ea48613d4a89612b8f3c02ad6b55de))
* landing csp ([#38](https://github.com/ImFelipeOliveira/standcast/issues/38)) ([d241bd3](https://github.com/ImFelipeOliveira/standcast/commit/d241bd3b801ac2a8714d3d9bf5272d7e42e0606c))
* landing csp, self-hosted fonts and docs robots and sitemap ([09e7263](https://github.com/ImFelipeOliveira/standcast/commit/09e7263941029a24950d215a948c39814482918c))
* landing csp, self-hosted fonts and docs robots and sitemap ([#37](https://github.com/ImFelipeOliveira/standcast/issues/37)) ([3664b1e](https://github.com/ImFelipeOliveira/standcast/commit/3664b1e2e26374e4281c8c3390c3e455da0bd214))
* reject impossible changelog dates and cover a missing changelog file ([#40](https://github.com/ImFelipeOliveira/standcast/issues/40)) ([c48dbd2](https://github.com/ImFelipeOliveira/standcast/commit/c48dbd25884cf7cc8deaabcbee586311606194bf))


### Documentation

* 0.3.0 and 0.2.1 changelog entries and a check that every release has one ([ba33dae](https://github.com/ImFelipeOliveira/standcast/commit/ba33dae3552a4af179619e7e177e63734c94da33))
* 0.3.0 changelog entries and a release check ([#39](https://github.com/ImFelipeOliveira/standcast/issues/39)) ([731e605](https://github.com/ImFelipeOliveira/standcast/commit/731e60596a31de09705cb0a6f9574eb9f04bded3))

## [0.3.0](https://github.com/ImFelipeOliveira/standwise/compare/standcast-v0.2.1...standcast-v0.3.0) (2026-11-01)


### Features

* **api:** cli sessions, draft and daily submission ([a2a1249](https://github.com/ImFelipeOliveira/standwise/commit/a2a1249f6e0f9661ecc094e3bb91b938908c83b9))
* **api:** github webhooks and config loading ([e7db337](https://github.com/ImFelipeOliveira/standwise/commit/e7db3376ad03b9c9d5f9c581313a9c7f802f0a9e))
* **api:** installation api keys and read-only organization endpoints ([570200f](https://github.com/ImFelipeOliveira/standwise/commit/570200f58fc992ad4cd33ada485810dc81ea9f25))
* **api:** manager read routes for mcp ([cb9fd53](https://github.com/ImFelipeOliveira/standwise/commit/cb9fd532415918ac62f1c54f9dd0d66a77071e27))
* **api:** move the api reference to /reference and redirect /docs to DOCS_URL ([dcc7bb3](https://github.com/ImFelipeOliveira/standwise/commit/dcc7bb394fbc00b7d97ee6bbe8a6c4d691c9d77e))
* **api:** openapi 3.1, /docs reference, integrator guides and rate limits ([989f56a](https://github.com/ImFelipeOliveira/standwise/commit/989f56a5fed5ca5776f2a92e275a01b627a18147))
* **api:** web login, setup page and slack connection ([1d7919c](https://github.com/ImFelipeOliveira/standwise/commit/1d7919c4554cbacd2dd446cd913899d368c26b0d))
* **cli:** default api url set at build time ([33a694e](https://github.com/ImFelipeOliveira/standwise/commit/33a694ec7594d454653d52631c3535aa6179431c))
* **cli:** local mcp server with draft and confirmed submit tools ([fa19e13](https://github.com/ImFelipeOliveira/standwise/commit/fa19e13bd265e51e9e890f66b5c362c35ca72b60))
* **cli:** login, draft and submit commands ([4e7ccb0](https://github.com/ImFelipeOliveira/standwise/commit/4e7ccb04a948ce389f7bd397760d64bd1cde63f4))
* connect linear from the setup page ([51ab67b](https://github.com/ImFelipeOliveira/standwise/commit/51ab67bb76b52c7be9a7a0badd432887cca3b00f))
* **core:** daily schema, member teams, activity window ([caa1ba5](https://github.com/ImFelipeOliveira/standwise/commit/caa1ba5b9c03596283eb5cdfeb1ed96f7df6f991))
* **core:** linear issue refs, card stale signal and card activity kinds ([172e703](https://github.com/ImFelipeOliveira/standwise/commit/172e703107b77acc3075125e31560d5e92872370))
* **core:** neutral message model and team digest ([cfe356b](https://github.com/ImFelipeOliveira/standwise/commit/cfe356b90768629a1ff09ef2f50bdd9e2c83bfaa))
* **core:** signal model, codeowners, pull request refs and config locations ([efd8be7](https://github.com/ImFelipeOliveira/standwise/commit/efd8be7343a59cd72a03fe3581fe71f705b3146f))
* **core:** timezone-aware workday calendar ([515dff6](https://github.com/ImFelipeOliveira/standwise/commit/515dff627cd5e74b131eb646974b8964900e3c52))
* **core:** workspace scaffold and standwise.yml parser ([493e557](https://github.com/ImFelipeOliveira/standwise/commit/493e5579656a2adb46a14b07a472d31d51d690f1))
* daily reminder for people who have not sent their daily ([2047ad2](https://github.com/ImFelipeOliveira/standwise/commit/2047ad28e93595e67713285502e6e26750a7b4a4))
* **db:** schema, repositories and secret encryption ([5aa7426](https://github.com/ImFelipeOliveira/standwise/commit/5aa74266a64d2f11e826f6e2414596d05672a2f0))
* **db:** suggestions and person-level delivery kinds ([8a19b16](https://github.com/ImFelipeOliveira/standwise/commit/8a19b165cce4e7d459957323641d4b746092dee7))
* default to english when no language is set ([737e331](https://github.com/ImFelipeOliveira/standwise/commit/737e331765c60ba49438cd1a4c2e6f1f3550ad44))
* docs on their own domain (Cloudflare Pages); API serves only the API ([a2ea523](https://github.com/ImFelipeOliveira/standwise/commit/a2ea523bf43113369d233623052581f84843b066))
* **docs:** build the docs with the public api url from STANDWISE_PUBLIC_URL ([41a91b9](https://github.com/ImFelipeOliveira/standwise/commit/41a91b9977cf36d5c5630a462026cb72596154ee))
* **docs:** serve the site at the root with cloudflare pages headers and redirects ([65d58c0](https://github.com/ImFelipeOliveira/standwise/commit/65d58c0a7277c789d26465831b5110f94677cbe3))
* foundation (plan 1) ([3d765a1](https://github.com/ImFelipeOliveira/standwise/commit/3d765a18ac65fd31b92fff99ef88091405140dfa))
* **github:** app client, config source, members and activity ([1d66d48](https://github.com/ImFelipeOliveira/standwise/commit/1d66d4818d34f0cce64eb04fa27350987a38ca9e))
* **github:** pull request, review, checks and codeowners reads; check runs ([60ba21b](https://github.com/ImFelipeOliveira/standwise/commit/60ba21b797ec72961f98bc407481523388e56cc7))
* landing page, beta requests and llms.txt for agents ([#29](https://github.com/ImFelipeOliveira/standwise/issues/29)) ([d6abec7](https://github.com/ImFelipeOliveira/standwise/commit/d6abec756433c05d6ca03c99bd44b142482e5a87))
* linear cards in the daily draft ([f01e30f](https://github.com/ImFelipeOliveira/standwise/commit/f01e30f878f0fb8c762e5ba4534537cdcc201e39))
* linear integration — cards in the draft, card blocker routing and card_stale suggestions ([26e9297](https://github.com/ImFelipeOliveira/standwise/commit/26e9297236f1d7e8a023c949a58fe40633c76884))
* **linear:** graphql client, oauth and issue, user and activity reads ([34ada9f](https://github.com/ImFelipeOliveira/standwise/commit/34ada9f264366c181ef5488346a71336660cbf95))
* link linear users to people by email or config ([5a27d3a](https://github.com/ImFelipeOliveira/standwise/commit/5a27d3ae41ddedf0f08bb3d18d70f46c54cf2bf6))
* mark the product as public beta; install link; wrangler config for the docs worker ([7616f97](https://github.com/ImFelipeOliveira/standwise/commit/7616f97db3b9016f8eac75928d3ef9744f61dac9))
* orchestration — reminders, blocker routing, suggested blockers and config check runs ([e87def0](https://github.com/ImFelipeOliveira/standwise/commit/e87def045c7ae7d69f0f71d4ddab37e892ab403f))
* **plugin:** claude code /daily skill with bundled mcp server ([5c18bd1](https://github.com/ImFelipeOliveira/standwise/commit/5c18bd1ecc4be76cbf3b8e5176e74bf86b739407))
* public beta labels, install link and docs worker config ([395e9a0](https://github.com/ImFelipeOliveira/standwise/commit/395e9a0eda47f2f046fe564ff4cedb55d21dd050))
* **queue:** JobQueue with pg-boss and in-memory implementations ([8d54b1a](https://github.com/ImFelipeOliveira/standwise/commit/8d54b1a468531a62e7d709590a3676d5fbb21b3c))
* route blockers to reviewers, codeowners or managers ([25db574](https://github.com/ImFelipeOliveira/standwise/commit/25db5747241edaf2640c071c0424ba3ffdbbaafe))
* route card blockers to the blocking card's owner ([f988f43](https://github.com/ImFelipeOliveira/standwise/commit/f988f43a9d00bb4011252e67d44f25d492a02bb1))
* setup notice for github teams that cannot be resolved ([de646fc](https://github.com/ImFelipeOliveira/standwise/commit/de646fcef41760d74e6c563ed8739787b5efe7d8))
* **slack:** block kit renderer, chat channel and oauth ([1485687](https://github.com/ImFelipeOliveira/standwise/commit/1485687fcdb531a8e290e96330c3f6fd168bc405))
* standwise.yml check runs; github webhooks only enqueue jobs ([ed1eed7](https://github.com/ImFelipeOliveira/standwise/commit/ed1eed72088a69c23eb54c1602399f66ce11e675))
* suggested blockers for cards stuck in progress ([447b1b1](https://github.com/ImFelipeOliveira/standwise/commit/447b1b118d7d174a8e095885613707b8afd9e1aa))
* suggested blockers from pull request reviews and failing checks ([d7aec66](https://github.com/ImFelipeOliveira/standwise/commit/d7aec669a2bf0a56113304bc946f02717b0e3fe7))
* suggestions in the draft with confirm and ignore across api, cli, mcp and skill ([a31dfb0](https://github.com/ImFelipeOliveira/standwise/commit/a31dfb0fd106b5e03107ee7cc1c396029fcb4c7c))
* **web:** design tokens and a small component kit for server pages ([b34a47d](https://github.com/ImFelipeOliveira/standwise/commit/b34a47d4fb7da6794f8db17876a5c400dbc28117))
* **web:** error pages in the new design; install docs match the setup labels ([49ebb2a](https://github.com/ImFelipeOliveira/standwise/commit/49ebb2a6052a862eff6f4ddf51f9f5c0e829f8f6))
* **web:** header with organization switcher, docs and sign out ([499c53e](https://github.com/ImFelipeOliveira/standwise/commit/499c53e3ef549dbf6b533557425e86cb724f6ebc))
* **webhooks:** signed outbound webhooks with retries and ssrf protection ([f3fc6f0](https://github.com/ImFelipeOliveira/standwise/commit/f3fc6f0bef0309d3148a5c240a6b8cb6d6e2fb1d))
* **web:** setup and error pages redesign ([961504a](https://github.com/ImFelipeOliveira/standwise/commit/961504a61e3221e0bf5fc84b8dec46485cddbe69))
* **web:** setup page as a step checklist with side cards ([b9ac60c](https://github.com/ImFelipeOliveira/standwise/commit/b9ac60c5282ec482f8e149b4811c06f31b925798))
* **worker:** scheduled team digest and late daily replies ([d1ef8cc](https://github.com/ImFelipeOliveira/standwise/commit/d1ef8cc25720c7a432e4f2874906f32cde92fce0))


### Bug Fixes

* access errors warn instead of dropping the config ([a7a6a42](https://github.com/ImFelipeOliveira/standwise/commit/a7a6a42164dcbf304b7aef4bf933f57eaee2d02b))
* address codeql alerts ([#32](https://github.com/ImFelipeOliveira/standwise/issues/32)) ([4f3fbf7](https://github.com/ImFelipeOliveira/standwise/commit/4f3fbf75a93f3b670bc454bbbb3be7cd2afaee81))
* **api:** health check uses the db package instead of an undeclared drizzle import; check-deps in ci ([1a42086](https://github.com/ImFelipeOliveira/standwise/commit/1a42086a88564f4ec38d91eef0e31ad1b711a45c))
* **api:** health drops a probe hung past five timeouts ([2b8e021](https://github.com/ImFelipeOliveira/standwise/commit/2b8e0213cac9d5b47295401181e65384ad3f23b9))
* **api:** lock out failed auth before lookup, ipv6 /64 buckets, csp hardening ([947c3a3](https://github.com/ImFelipeOliveira/standwise/commit/947c3a3aef3acb59db023fe4cf656733ed59133e))
* **api:** login csrf nonce, setup after install, localized error pages ([2c9d49e](https://github.com/ImFelipeOliveira/standwise/commit/2c9d49ef45a9220f39288f900863496ebc2f6eed))
* **api:** logout ignores cross-site posts and requests without a session cookie ([e8784d3](https://github.com/ImFelipeOliveira/standwise/commit/e8784d34722813eea1a55587cb1be0658984adaf))
* **api:** never lock out valid sessions on failed-auth counts ([78e0115](https://github.com/ImFelipeOliveira/standwise/commit/78e011547f53562c1266f79a4a8795aee2650512))
* **api:** permissive published schemas, live admin checks on key changes, prg for new keys ([53cfa97](https://github.com/ImFelipeOliveira/standwise/commit/53cfa97693de6a772476ba9461f74854c7482d14))
* **api:** rate limit after auth, trusted proxy hops, 422 on bad bodies ([74975ae](https://github.com/ImFelipeOliveira/standwise/commit/74975aeb9e64755e919de5c31c3a7a4e5f087e9e))
* **api:** resilient identity linking, token errors, live org membership ([ce4779e](https://github.com/ImFelipeOliveira/standwise/commit/ce4779ed6ee4c5c9ef410ecc2a5b7470445b68d7))
* **api:** undeclared drizzle-orm import broke the production image ([f7f3b49](https://github.com/ImFelipeOliveira/standwise/commit/f7f3b497a23457b6d67ac356b6c67d118213992c))
* atomic per-daily blocker route cap and a reason line in routed DMs ([53bc229](https://github.com/ImFelipeOliveira/standwise/commit/53bc2299377c055f51d6e14ec23bb7b51e1a097e))
* blocker routing fallbacks, identity lookup and claim handling ([76f0090](https://github.com/ImFelipeOliveira/standwise/commit/76f00909a60cc52867bf1057cd700e288438a820))
* canonical install url, explicit railway start commands, safer install.sh ([48159a2](https://github.com/ImFelipeOliveira/standwise/commit/48159a266dec2833588068a1f218181f33057138))
* clamp suggestion titles in the draft and widen the suggestion leak test ([c5f87c9](https://github.com/ImFelipeOliveira/standwise/commit/c5f87c9f9824e1e973701f5536c6654d9099de08))
* clean stale slack identities on user_not_found and user_disabled only ([a4f02dc](https://github.com/ImFelipeOliveira/standwise/commit/a4f02dce4aab68a3759a196e80ebe2aa1169058a))
* **cli:** disable bunfig autoload, keep api path, no redirects ([f011518](https://github.com/ImFelipeOliveira/standwise/commit/f011518767a243c393917c2412f66b6440f9b3bd))
* **cli:** enforce https api urls, server-side logout, device flow hardening ([25af97c](https://github.com/ImFelipeOliveira/standwise/commit/25af97c8b3d2a8c4198c193f2c96a78cceb7e5ef))
* concurrent health probes share one query instead of failing ([ca39388](https://github.com/ImFelipeOliveira/standwise/commit/ca39388524dc26a9ffc574eb7f040aac8672cb83))
* **core:** directory-only codeowners patterns with repeated segments ([c4faa5c](https://github.com/ImFelipeOliveira/standwise/commit/c4faa5ca7a52d3f6278e84db400b98642d72cb24))
* **core:** linear-time codeowners matching and ownerless rules ([e4a5568](https://github.com/ImFelipeOliveira/standwise/commit/e4a55688e1b4f88e33c04609d6b2ba8129802b5a))
* **core:** reject unsafe characters and non-http schemes in ref urls ([008ad10](https://github.com/ImFelipeOliveira/standwise/commit/008ad10a244fa3615bf3db4e1a7db9fe31013a17))
* **db:** delivery claim fencing, session expiry, login uniqueness ([3b8e8fd](https://github.com/ImFelipeOliveira/standwise/commit/3b8e8fdaea6e23d1c4cc9ce31b3c05913530c95f))
* **db:** idempotent decideSuggestion and single-shot notified mark ([ec2f58b](https://github.com/ImFelipeOliveira/standwise/commit/ec2f58bde32f1d728e80deade961148c76674017))
* **db:** unforgeable placeholder for released logins ([eb83c26](https://github.com/ImFelipeOliveira/standwise/commit/eb83c26db841b209f7623c92af478ed0baade3df))
* **docs:** pt-br redirect and static headers; paginate team members ([bfec1e1](https://github.com/ImFelipeOliveira/standwise/commit/bfec1e12451f7e0a5aac413f7eb5a5afe5697db1))
* **docs:** readable text in dark mode ([bc3dfe5](https://github.com/ImFelipeOliveira/standwise/commit/bc3dfe5fd1c7ddc30577f322443058e12651d5ef))
* **docs:** readable text in dark mode ([892eb68](https://github.com/ImFelipeOliveira/standwise/commit/892eb689ffa92a3d49ac25664a0c373d92162464))
* drop the config when standwise.yml is removed ([ab19c85](https://github.com/ImFelipeOliveira/standwise/commit/ab19c85b381d6e19cabcd40443cd2510978f91fa))
* episode-scoped no-review suggestions, stately spread scans and typed github rate limits ([294abc7](https://github.com/ImFelipeOliveira/standwise/commit/294abc76da85f72cae6ca101fe8175ae5221a8e3))
* **github:** a forbidden team listing is reported as missing unless rate limited ([bc6d578](https://github.com/ImFelipeOliveira/standwise/commit/bc6d578e5d90fbeff250d440ff7fe4e2c9547a8e))
* **github:** paginate review, timeline and check-run reads; raw codeowners ([4018966](https://github.com/ImFelipeOliveira/standwise/commit/401896639a92e5274082b75d46436eccf5008a9b))
* **github:** read raw codeowners body as text regardless of content type ([570a527](https://github.com/ImFelipeOliveira/standwise/commit/570a527b8bdea9d890f3937675a72d3fa6b256f6))
* guarded slack identity writes, queued tracker linking and stale identity cleanup ([e529af8](https://github.com/ImFelipeOliveira/standwise/commit/e529af85f6c538c976f987831f475951d8a0dccb))
* hardening before the first release ([54efa42](https://github.com/ImFelipeOliveira/standwise/commit/54efa42b1142480b3f50e8bb57e7d39377519aca))
* hide suggestion deliveries from admins and resolve check suites in a job ([521c60a](https://github.com/ImFelipeOliveira/standwise/commit/521c60a5d65416f2f5c6414fce8e6d2b1f424ba7))
* install https-only, i18n elicitation, public url and api hardening ([2ca93c5](https://github.com/ImFelipeOliveira/standwise/commit/2ca93c55ae475e47dbe1edd5d2f7f21828bc035f))
* isolate setup team notices from failures and slow github ([7664cfd](https://github.com/ImFelipeOliveira/standwise/commit/7664cfd44c47e528848e47363b151465ac4fb018))
* keep last valid config when standwise.yml is invalid ([eaa7690](https://github.com/ImFelipeOliveira/standwise/commit/eaa769003b09089a2b92aa478fbf9b1d06e4e790))
* keep query for non-github hosts in ref identity, skip scan before resolving teams ([f878774](https://github.com/ImFelipeOliveira/standwise/commit/f8787743af786996479fcac3216e59183880e276))
* **linear:** bound linear calls, compare-and-swap token rotation, narrow auth errors ([b5a114a](https://github.com/ImFelipeOliveira/standwise/commit/b5a114a04d30d781f592225507164d25954980fb))
* **linear:** classify errors by type, ignore email case, order activity, cap error messages ([f4f30f6](https://github.com/ImFelipeOliveira/standwise/commit/f4f30f653600b6f5aa7b23c815f435a1f790cda4))
* **linear:** keep a valid token on refresh outages and heal the workspace key ([0508cb9](https://github.com/ImFelipeOliveira/standwise/commit/0508cb9d7e3517a40dfe213f6ee24035fe0038ed))
* **linear:** keep relink jobs, retry rate limits and never write identities across workspaces ([3047c02](https://github.com/ImFelipeOliveira/standwise/commit/3047c025b11fd5b5d61b69a4f6ecf4f5f0538fab))
* **linear:** keep the tracker factory safe and relink identities on config change ([166f4a6](https://github.com/ImFelipeOliveira/standwise/commit/166f4a6e88080dca78d9ee9d72830d54b5aae45a))
* **linear:** let linear access invalidate only the connection it used ([d9022ea](https://github.com/ImFelipeOliveira/standwise/commit/d9022ea86580a8b34f44eec8dea4925696f80b52))
* **linear:** resolve github teams when linking linear users, harden identity lookup ([716e56c](https://github.com/ImFelipeOliveira/standwise/commit/716e56cbb151fa0123928e8814760c33b72c9d67))
* **mcp:** confirm exactly what is posted, reject control chars, scope team names ([a1ba064](https://github.com/ImFelipeOliveira/standwise/commit/a1ba064d838cada16cf69b8db70d8bf11b5fd3cd))
* **mcp:** elicitation-based confirmation and untrusted data fencing ([412dad1](https://github.com/ImFelipeOliveira/standwise/commit/412dad14aca2734db518bac1bf909bd4700f29fd))
* plan 1 follow-ups (rate limit, slack 429, safe logs, data pruning, membership cache, managers validation) ([e8433f7](https://github.com/ImFelipeOliveira/standwise/commit/e8433f77b094e0aa6d7d812daff5f6e3ce5f627b))
* **plugin:** exit-code safe cli fallback and mcp error handling ([b3797e9](https://github.com/ImFelipeOliveira/standwise/commit/b3797e9b8143bb0f78286500a3cb1a5b5a689711))
* **plugin:** unindented heredoc delimiter ([4d78870](https://github.com/ImFelipeOliveira/standwise/commit/4d78870a4f5520003fec5588cc144aee7ee89a99))
* prune only resolved suggestions in batches and log unhandled api errors safely ([4e66207](https://github.com/ImFelipeOliveira/standwise/commit/4e66207f7474e2c0a9a497d6cd29c058d4db1181))
* prune person-level delivery rows after 90 days and drop unused exports ([ed221f2](https://github.com/ImFelipeOliveira/standwise/commit/ed221f299ba4fce67ace278466ab0f2fb3db402a))
* **queue:** pin in-flight singleton semantics and align memory queue ([e8548a2](https://github.com/ImFelipeOliveira/standwise/commit/e8548a20a98eaf89e65886a03a7e71583693a07f))
* **release:** bump the plugin version with each release and keep the generated changelog out of lint ([9b86ab6](https://github.com/ImFelipeOliveira/standwise/commit/9b86ab64b1a78ec63b60747dd76b703d09293f8a))
* **release:** versions match the GitHub releases everywhere ([#19](https://github.com/ImFelipeOliveira/standwise/issues/19)) ([01ceb50](https://github.com/ImFelipeOliveira/standwise/commit/01ceb50ba02fa690f35fa142a845b02a851004aa))
* reminder window, digest isolation, bulk chat ids ([927c3a7](https://github.com/ImFelipeOliveira/standwise/commit/927c3a73f59607d5a59e2b55f91f077b4cf5ae73))
* route blockers by ref identity, once per recipient set, capped at 10 per daily ([f190806](https://github.com/ImFelipeOliveira/standwise/commit/f190806674e415368672155cf8268f525fcca43d))
* **security:** cache negative membership and rate limit web routes ([4931bc1](https://github.com/ImFelipeOliveira/standwise/commit/4931bc1ec276ab64ce3968f7c2811cf12b546e4d))
* **security:** check membership by immutable github id ([36d32fe](https://github.com/ImFelipeOliveira/standwise/commit/36d32fefc27ba810ff06024fe2c946c1d9fd88d4))
* **security:** only admins connect slack ([e2d291b](https://github.com/ImFelipeOliveira/standwise/commit/e2d291bc2485786c87a4caa996a7fe8c52da243f))
* **security:** security headers on web pages ([0af3a3d](https://github.com/ImFelipeOliveira/standwise/commit/0af3a3d5cf9f20160691b81c5b66059c40d855e5))
* serialize config loads, load on every default branch push and move scan eligibility out of the webhook ([e4ce302](https://github.com/ImFelipeOliveira/standwise/commit/e4ce3026bc72e3a44707318bb8a2274985f7814b))
* setup page splits team failures from grouped person failures with translated kinds ([397a4b4](https://github.com/ImFelipeOliveira/standwise/commit/397a4b48ebfb65d0341438e4d53eeb13661a0e8b))
* **setup:** show the linear not-connected notice only without a connection ([de76aed](https://github.com/ImFelipeOliveira/standwise/commit/de76aed4ddfc6da49ec3342eda628dcb2d3b5a2a))
* **signals:** skip card sync on a truncated Linear page and log the installation ([224ec35](https://github.com/ImFelipeOliveira/standwise/commit/224ec3524b1bf4fee8ad3e8182fa2e934a6b3b76))
* skip completed daily scans, case-insensitive ref identity, concurrent draft sources ([b1427ca](https://github.com/ImFelipeOliveira/standwise/commit/b1427caaf8850b216f89909849d000b5725670db))
* skip health probes while a previous query is still running ([92a470a](https://github.com/ImFelipeOliveira/standwise/commit/92a470a3e73067b1d5716a53dc3ffd4483810930))
* **slack:** bounded retries and timeout to keep one digest per day ([7fe0184](https://github.com/ImFelipeOliveira/standwise/commit/7fe0184dbc0a337023f2099b64b88f1fcceff5c4))
* **slack:** escape untrusted text and urls, harden block limits ([aab9f0a](https://github.com/ImFelipeOliveira/standwise/commit/aab9f0a3d3baf90cbfa07f01a249b17f0683742b))
* use config slack mapping in digests and reset identities on workspace change ([2838c84](https://github.com/ImFelipeOliveira/standwise/commit/2838c84ab20eb23e0d69889c8b21da985ef2f424))
* use refreshed login within the same request ([00e7f03](https://github.com/ImFelipeOliveira/standwise/commit/00e7f03dd3a88e4b13d24b6b433b328a6e1570a5))
* web logout, bounded health check and busybox-safe installer ([e4bd32f](https://github.com/ImFelipeOliveira/standwise/commit/e4bd32f2d41f0a04fa4568945a6dec985627eacb))
* **web:** deliveries log as compact rows, header landmark, step order and dead css ([88b46f2](https://github.com/ImFelipeOliveira/standwise/commit/88b46f2253b6aeab80389b19f5a7b1a5722018c5))
* **web:** keep button colors inside alerts, add sr-only and a labelled step status ([8c754ea](https://github.com/ImFelipeOliveira/standwise/commit/8c754ea269438a6954ecd80e047a7b2a024f392d))
* **web:** organization switch button matches the select size ([1178c75](https://github.com/ImFelipeOliveira/standwise/commit/1178c759fd67a3bbfb41cd6d86637d86c4b5db65))
* **worker:** reconcile dailies submitted mid-digest and harden retries ([ce24d82](https://github.com/ImFelipeOliveira/standwise/commit/ce24d82c32174e5140a2d1d62be2eaa90de05940))
* workers poll only the queues each job uses and pg-boss errors log safe fields ([2dc7605](https://github.com/ImFelipeOliveira/standwise/commit/2dc7605e0dbc7b80661f98bde2d2478db5f24a9b))


### Performance

* cache resolved teams per installation ([5f3f1de](https://github.com/ImFelipeOliveira/standwise/commit/5f3f1dee8e5e69ebfe4097282e14d918e52af23d))


### Documentation

* add hardening implementation plan ([d9845d0](https://github.com/ImFelipeOliveira/standwise/commit/d9845d0ec94cad35ecc7c4418f15135dd45ef9d0))
* add layering rule (use cases in orchestrator, thin routes) ([f56cf51](https://github.com/ImFelipeOliveira/standwise/commit/f56cf5187f7d3e93b186f5a3b24f1e1a4b8182b5))
* add linear implementation plan ([669f571](https://github.com/ImFelipeOliveira/standwise/commit/669f571c8e074c79cd03adc6764a40112a6961c3))
* add manager read tools to the mcp server ([7789493](https://github.com/ImFelipeOliveira/standwise/commit/77894935cec6f598bbd0723c2d319ab70de9c1d5))
* add monetization direction for agents ([8f2d6f3](https://github.com/ImFelipeOliveira/standwise/commit/8f2d6f34bbffbe143980da81efaa0064a8d980f5))
* add orchestration implementation plan ([b0e45fe](https://github.com/ImFelipeOliveira/standwise/commit/b0e45fe314e376d28414a649fb4b964635119254))
* add public api, outbound webhooks and mcp to spec and plan 1 ([3531ae1](https://github.com/ImFelipeOliveira/standwise/commit/3531ae19c0c38a28e390cee28f8b42cc997d54f4))
* add Standwise design draft ([4a44183](https://github.com/ImFelipeOliveira/standwise/commit/4a441832dac6dc0a1d0100f263cc0c8b460b6c27))
* add Standwise plan 1 (foundation) and pin config location and email permission ([905b5b9](https://github.com/ImFelipeOliveira/standwise/commit/905b5b9ec0d46eff2c48038dc0b266d7d82e9a13))
* add thin-slice phase 0 and hosted-only v1 ([6444ed0](https://github.com/ImFelipeOliveira/standwise/commit/6444ed08a1096429004a94576c8ad65fc34b9ac4))
* add ui implementation plan ([32b5744](https://github.com/ImFelipeOliveira/standwise/commit/32b574451d3cb331c2e01a8d45f529118fc3b532))
* admin-only slack and keep-last-valid config ([26a0e42](https://github.com/ImFelipeOliveira/standwise/commit/26a0e428b15f5c25d6e622a2207866a70936797b))
* card suggestions are checked only by the daily scan ([369b334](https://github.com/ImFelipeOliveira/standwise/commit/369b334558b26d6aa90885cea0e149cf7b798ec7))
* changelogs and openapi version follow the github releases ([ac8d82d](https://github.com/ImFelipeOliveira/standwise/commit/ac8d82d1312aab218a3c2134fc198b50e48b556c))
* cloudflare pages setup, DOCS_URL and the docs domain ([4adf0a3](https://github.com/ImFelipeOliveira/standwise/commit/4adf0a3831c097c4ca9a3a3ff8ee3d66c077cf76))
* complete documentation site with overview, guides and api reference ([76d7c96](https://github.com/ImFelipeOliveira/standwise/commit/76d7c96ebd9ed708263526f92967e25af2163f60))
* defer component library decision to phase 2 ([f764c1f](https://github.com/ImFelipeOliveira/standwise/commit/f764c1f70eb34886151300910e21881348c0276c))
* drop deadline-driven phase 0 ([94cf3d3](https://github.com/ImFelipeOliveira/standwise/commit/94cf3d3c8e436e1af95e10724ea9904d29db33f5))
* english is the default language when none is set ([8f8bd54](https://github.com/ImFelipeOliveira/standwise/commit/8f8bd5425ef6df6a97d3a22d9d41052f80eacfec))
* final-domain checklist includes the published install url check ([86cdebe](https://github.com/ImFelipeOliveira/standwise/commit/86cdebe7c17cf5e3230671f508f7784e869840d1))
* hosting is Felipe-only, no self-host ([23d67b6](https://github.com/ImFelipeOliveira/standwise/commit/23d67b605f5a691dcd56c6bd1cb22108a35d96bc))
* keep agent write routes internal; agents use mcp or skill ([01da3b3](https://github.com/ImFelipeOliveira/standwise/commit/01da3b38ef8e528d2497d83f2732131908ccc15c))
* landing page lists shipped orchestration features ([6d9a54e](https://github.com/ImFelipeOliveira/standwise/commit/6d9a54efee2f26794af3cfd4be11334af0697f81))
* linear integration ([f189604](https://github.com/ImFelipeOliveira/standwise/commit/f189604747fbb8c49ba291a8c2fbc758e6299218))
* linear troubleshooting points at the stopped-working message and privacy lists routing reads ([87472ae](https://github.com/ImFelipeOliveira/standwise/commit/87472aeb1c7303b512fb80744766b83995652dee))
* llm key is per organization ([5bd1c64](https://github.com/ImFelipeOliveira/standwise/commit/5bd1c6466ae68db3e3e141b96a662fecfebd5832))
* mcp converses in the user's language and never translates dailies ([c9dba39](https://github.com/ImFelipeOliveira/standwise/commit/c9dba391c4b157203c815ac33f1fed535c998edf))
* no_route_target meaning, routing identity and cap, review episodes, person delivery retention ([d66384b](https://github.com/ImFelipeOliveira/standwise/commit/d66384b07346fad04808ea40c8d761bf9a58c5a3))
* plan a complete documentation site with product overview ([605a608](https://github.com/ImFelipeOliveira/standwise/commit/605a6089ed02b6c465562e99c00a0ed0f67d7165))
* plan phase 2 org-level AI analysis with byok ([c42a981](https://github.com/ImFelipeOliveira/standwise/commit/c42a9818b6f5cb4e0550b3b6b971a7147b093dad))
* plugin bundles the mcp server with the /daily skill ([f6e8cd8](https://github.com/ImFelipeOliveira/standwise/commit/f6e8cd817fe47f0e8636c88b29ef731643e20dc8))
* point readers at the interim api domain and list every place to change for the final one ([1138cc3](https://github.com/ImFelipeOliveira/standwise/commit/1138cc3e2c5a8e147ae7b786a7f3919b3cf0169f))
* readme roadmap and features for reminders, routing, suggestions and check runs ([2fc6311](https://github.com/ImFelipeOliveira/standwise/commit/2fc6311455a82719e3d403ef0ef93c6fcd5c39c8))
* redesign README ([49644ff](https://github.com/ImFelipeOliveira/standwise/commit/49644ffb388a5882505887ecae4a4a6c96c8196c))
* redesign README with badges, diagram and roadmap ([cbd8a8c](https://github.com/ImFelipeOliveira/standwise/commit/cbd8a8ce6ebec6d2bcbb13c2a3ee796f1ef8f696))
* reminders, blocker routing, suggested blockers and config check runs ([aa39224](https://github.com/ImFelipeOliveira/standwise/commit/aa392248429f210de4de18aadecfb41165a51acd))
* remove phase 0, build 1a at author's pace ([9331e47](https://github.com/ImFelipeOliveira/standwise/commit/9331e4772396e06afd9fd4cb4b27b3bbf6a395c8))
* resolve builder-check questions in Standwise design ([96fa24d](https://github.com/ImFelipeOliveira/standwise/commit/96fa24d482bda597bdfaf8ffc68123a7fe6627a8))
* single api replica, deploying without a domain, hardening notes ([92670cc](https://github.com/ImFelipeOliveira/standwise/commit/92670ccfa26048f9ab60681d4bc0813d285a9b10))
* **site:** setup errors table, edit link on invalid files, deliveries list ([c88c9bb](https://github.com/ImFelipeOliveira/standwise/commit/c88c9bbf6c33876c142978c06260ce8f107fdab9))


### Refactoring

* **cli:** one shared default api url resolver for the cli and its build ([15ef983](https://github.com/ImFelipeOliveira/standwise/commit/15ef983fef6b66b300e4b76a87807ea5a9f190b8))
* move business rules into orchestrator use cases ([151bb01](https://github.com/ImFelipeOliveira/standwise/commit/151bb0131a96f27d44407a4b1ae10015d78e75d3))
* rename standwise to standcast ([#31](https://github.com/ImFelipeOliveira/standwise/issues/31)) ([42bdcbb](https://github.com/ImFelipeOliveira/standwise/commit/42bdcbbb5698a96fbb863969dab23d46cad215ec))
* **web:** compact admin lists and setup polish ([cdae865](https://github.com/ImFelipeOliveira/standwise/commit/cdae865edcc32301567225984a96a6eff5949dbc))

## [0.2.1](https://github.com/ImFelipeOliveira/standwise/compare/standwise-v0.2.0...standwise-v0.2.1) (2026-10-31)


### Bug Fixes

* **release:** bump the plugin version with each release and keep the generated changelog out of lint ([9b86ab6](https://github.com/ImFelipeOliveira/standwise/commit/9b86ab64b1a78ec63b60747dd76b703d09293f8a))
* **release:** versions match the GitHub releases everywhere ([#19](https://github.com/ImFelipeOliveira/standwise/issues/19)) ([01ceb50](https://github.com/ImFelipeOliveira/standwise/commit/01ceb50ba02fa690f35fa142a845b02a851004aa))


### Documentation

* changelogs and openapi version follow the github releases ([ac8d82d](https://github.com/ImFelipeOliveira/standwise/commit/ac8d82d1312aab218a3c2134fc198b50e48b556c))

## [0.2.0](https://github.com/ImFelipeOliveira/standwise/compare/standwise-v0.1.0...standwise-v0.2.0) (2026-10-31)


### Features

* **api:** cli sessions, draft and daily submission ([a2a1249](https://github.com/ImFelipeOliveira/standwise/commit/a2a1249f6e0f9661ecc094e3bb91b938908c83b9))
* **api:** github webhooks and config loading ([e7db337](https://github.com/ImFelipeOliveira/standwise/commit/e7db3376ad03b9c9d5f9c581313a9c7f802f0a9e))
* **api:** installation api keys and read-only organization endpoints ([570200f](https://github.com/ImFelipeOliveira/standwise/commit/570200f58fc992ad4cd33ada485810dc81ea9f25))
* **api:** manager read routes for mcp ([cb9fd53](https://github.com/ImFelipeOliveira/standwise/commit/cb9fd532415918ac62f1c54f9dd0d66a77071e27))
* **api:** move the api reference to /reference and redirect /docs to DOCS_URL ([dcc7bb3](https://github.com/ImFelipeOliveira/standwise/commit/dcc7bb394fbc00b7d97ee6bbe8a6c4d691c9d77e))
* **api:** openapi 3.1, /docs reference, integrator guides and rate limits ([989f56a](https://github.com/ImFelipeOliveira/standwise/commit/989f56a5fed5ca5776f2a92e275a01b627a18147))
* **api:** web login, setup page and slack connection ([1d7919c](https://github.com/ImFelipeOliveira/standwise/commit/1d7919c4554cbacd2dd446cd913899d368c26b0d))
* **cli:** default api url set at build time ([33a694e](https://github.com/ImFelipeOliveira/standwise/commit/33a694ec7594d454653d52631c3535aa6179431c))
* **cli:** local mcp server with draft and confirmed submit tools ([fa19e13](https://github.com/ImFelipeOliveira/standwise/commit/fa19e13bd265e51e9e890f66b5c362c35ca72b60))
* **cli:** login, draft and submit commands ([4e7ccb0](https://github.com/ImFelipeOliveira/standwise/commit/4e7ccb04a948ce389f7bd397760d64bd1cde63f4))
* connect linear from the setup page ([51ab67b](https://github.com/ImFelipeOliveira/standwise/commit/51ab67bb76b52c7be9a7a0badd432887cca3b00f))
* **core:** daily schema, member teams, activity window ([caa1ba5](https://github.com/ImFelipeOliveira/standwise/commit/caa1ba5b9c03596283eb5cdfeb1ed96f7df6f991))
* **core:** linear issue refs, card stale signal and card activity kinds ([172e703](https://github.com/ImFelipeOliveira/standwise/commit/172e703107b77acc3075125e31560d5e92872370))
* **core:** neutral message model and team digest ([cfe356b](https://github.com/ImFelipeOliveira/standwise/commit/cfe356b90768629a1ff09ef2f50bdd9e2c83bfaa))
* **core:** signal model, codeowners, pull request refs and config locations ([efd8be7](https://github.com/ImFelipeOliveira/standwise/commit/efd8be7343a59cd72a03fe3581fe71f705b3146f))
* **core:** timezone-aware workday calendar ([515dff6](https://github.com/ImFelipeOliveira/standwise/commit/515dff627cd5e74b131eb646974b8964900e3c52))
* **core:** workspace scaffold and standwise.yml parser ([493e557](https://github.com/ImFelipeOliveira/standwise/commit/493e5579656a2adb46a14b07a472d31d51d690f1))
* daily reminder for people who have not sent their daily ([2047ad2](https://github.com/ImFelipeOliveira/standwise/commit/2047ad28e93595e67713285502e6e26750a7b4a4))
* **db:** schema, repositories and secret encryption ([5aa7426](https://github.com/ImFelipeOliveira/standwise/commit/5aa74266a64d2f11e826f6e2414596d05672a2f0))
* **db:** suggestions and person-level delivery kinds ([8a19b16](https://github.com/ImFelipeOliveira/standwise/commit/8a19b165cce4e7d459957323641d4b746092dee7))
* default to english when no language is set ([737e331](https://github.com/ImFelipeOliveira/standwise/commit/737e331765c60ba49438cd1a4c2e6f1f3550ad44))
* docs on their own domain (Cloudflare Pages); API serves only the API ([a2ea523](https://github.com/ImFelipeOliveira/standwise/commit/a2ea523bf43113369d233623052581f84843b066))
* **docs:** build the docs with the public api url from STANDWISE_PUBLIC_URL ([41a91b9](https://github.com/ImFelipeOliveira/standwise/commit/41a91b9977cf36d5c5630a462026cb72596154ee))
* **docs:** serve the site at the root with cloudflare pages headers and redirects ([65d58c0](https://github.com/ImFelipeOliveira/standwise/commit/65d58c0a7277c789d26465831b5110f94677cbe3))
* foundation (plan 1) ([3d765a1](https://github.com/ImFelipeOliveira/standwise/commit/3d765a18ac65fd31b92fff99ef88091405140dfa))
* **github:** app client, config source, members and activity ([1d66d48](https://github.com/ImFelipeOliveira/standwise/commit/1d66d4818d34f0cce64eb04fa27350987a38ca9e))
* **github:** pull request, review, checks and codeowners reads; check runs ([60ba21b](https://github.com/ImFelipeOliveira/standwise/commit/60ba21b797ec72961f98bc407481523388e56cc7))
* linear cards in the daily draft ([f01e30f](https://github.com/ImFelipeOliveira/standwise/commit/f01e30f878f0fb8c762e5ba4534537cdcc201e39))
* linear integration — cards in the draft, card blocker routing and card_stale suggestions ([26e9297](https://github.com/ImFelipeOliveira/standwise/commit/26e9297236f1d7e8a023c949a58fe40633c76884))
* **linear:** graphql client, oauth and issue, user and activity reads ([34ada9f](https://github.com/ImFelipeOliveira/standwise/commit/34ada9f264366c181ef5488346a71336660cbf95))
* link linear users to people by email or config ([5a27d3a](https://github.com/ImFelipeOliveira/standwise/commit/5a27d3ae41ddedf0f08bb3d18d70f46c54cf2bf6))
* mark the product as public beta; install link; wrangler config for the docs worker ([7616f97](https://github.com/ImFelipeOliveira/standwise/commit/7616f97db3b9016f8eac75928d3ef9744f61dac9))
* orchestration — reminders, blocker routing, suggested blockers and config check runs ([e87def0](https://github.com/ImFelipeOliveira/standwise/commit/e87def045c7ae7d69f0f71d4ddab37e892ab403f))
* **plugin:** claude code /daily skill with bundled mcp server ([5c18bd1](https://github.com/ImFelipeOliveira/standwise/commit/5c18bd1ecc4be76cbf3b8e5176e74bf86b739407))
* public beta labels, install link and docs worker config ([395e9a0](https://github.com/ImFelipeOliveira/standwise/commit/395e9a0eda47f2f046fe564ff4cedb55d21dd050))
* **queue:** JobQueue with pg-boss and in-memory implementations ([8d54b1a](https://github.com/ImFelipeOliveira/standwise/commit/8d54b1a468531a62e7d709590a3676d5fbb21b3c))
* route blockers to reviewers, codeowners or managers ([25db574](https://github.com/ImFelipeOliveira/standwise/commit/25db5747241edaf2640c071c0424ba3ffdbbaafe))
* route card blockers to the blocking card's owner ([f988f43](https://github.com/ImFelipeOliveira/standwise/commit/f988f43a9d00bb4011252e67d44f25d492a02bb1))
* setup notice for github teams that cannot be resolved ([de646fc](https://github.com/ImFelipeOliveira/standwise/commit/de646fcef41760d74e6c563ed8739787b5efe7d8))
* **slack:** block kit renderer, chat channel and oauth ([1485687](https://github.com/ImFelipeOliveira/standwise/commit/1485687fcdb531a8e290e96330c3f6fd168bc405))
* standwise.yml check runs; github webhooks only enqueue jobs ([ed1eed7](https://github.com/ImFelipeOliveira/standwise/commit/ed1eed72088a69c23eb54c1602399f66ce11e675))
* suggested blockers for cards stuck in progress ([447b1b1](https://github.com/ImFelipeOliveira/standwise/commit/447b1b118d7d174a8e095885613707b8afd9e1aa))
* suggested blockers from pull request reviews and failing checks ([d7aec66](https://github.com/ImFelipeOliveira/standwise/commit/d7aec669a2bf0a56113304bc946f02717b0e3fe7))
* suggestions in the draft with confirm and ignore across api, cli, mcp and skill ([a31dfb0](https://github.com/ImFelipeOliveira/standwise/commit/a31dfb0fd106b5e03107ee7cc1c396029fcb4c7c))
* **web:** design tokens and a small component kit for server pages ([b34a47d](https://github.com/ImFelipeOliveira/standwise/commit/b34a47d4fb7da6794f8db17876a5c400dbc28117))
* **web:** error pages in the new design; install docs match the setup labels ([49ebb2a](https://github.com/ImFelipeOliveira/standwise/commit/49ebb2a6052a862eff6f4ddf51f9f5c0e829f8f6))
* **web:** header with organization switcher, docs and sign out ([499c53e](https://github.com/ImFelipeOliveira/standwise/commit/499c53e3ef549dbf6b533557425e86cb724f6ebc))
* **webhooks:** signed outbound webhooks with retries and ssrf protection ([f3fc6f0](https://github.com/ImFelipeOliveira/standwise/commit/f3fc6f0bef0309d3148a5c240a6b8cb6d6e2fb1d))
* **web:** setup and error pages redesign ([961504a](https://github.com/ImFelipeOliveira/standwise/commit/961504a61e3221e0bf5fc84b8dec46485cddbe69))
* **web:** setup page as a step checklist with side cards ([b9ac60c](https://github.com/ImFelipeOliveira/standwise/commit/b9ac60c5282ec482f8e149b4811c06f31b925798))
* **worker:** scheduled team digest and late daily replies ([d1ef8cc](https://github.com/ImFelipeOliveira/standwise/commit/d1ef8cc25720c7a432e4f2874906f32cde92fce0))


### Bug Fixes

* access errors warn instead of dropping the config ([a7a6a42](https://github.com/ImFelipeOliveira/standwise/commit/a7a6a42164dcbf304b7aef4bf933f57eaee2d02b))
* **api:** health check uses the db package instead of an undeclared drizzle import; check-deps in ci ([1a42086](https://github.com/ImFelipeOliveira/standwise/commit/1a42086a88564f4ec38d91eef0e31ad1b711a45c))
* **api:** health drops a probe hung past five timeouts ([2b8e021](https://github.com/ImFelipeOliveira/standwise/commit/2b8e0213cac9d5b47295401181e65384ad3f23b9))
* **api:** lock out failed auth before lookup, ipv6 /64 buckets, csp hardening ([947c3a3](https://github.com/ImFelipeOliveira/standwise/commit/947c3a3aef3acb59db023fe4cf656733ed59133e))
* **api:** login csrf nonce, setup after install, localized error pages ([2c9d49e](https://github.com/ImFelipeOliveira/standwise/commit/2c9d49ef45a9220f39288f900863496ebc2f6eed))
* **api:** logout ignores cross-site posts and requests without a session cookie ([e8784d3](https://github.com/ImFelipeOliveira/standwise/commit/e8784d34722813eea1a55587cb1be0658984adaf))
* **api:** never lock out valid sessions on failed-auth counts ([78e0115](https://github.com/ImFelipeOliveira/standwise/commit/78e011547f53562c1266f79a4a8795aee2650512))
* **api:** permissive published schemas, live admin checks on key changes, prg for new keys ([53cfa97](https://github.com/ImFelipeOliveira/standwise/commit/53cfa97693de6a772476ba9461f74854c7482d14))
* **api:** rate limit after auth, trusted proxy hops, 422 on bad bodies ([74975ae](https://github.com/ImFelipeOliveira/standwise/commit/74975aeb9e64755e919de5c31c3a7a4e5f087e9e))
* **api:** resilient identity linking, token errors, live org membership ([ce4779e](https://github.com/ImFelipeOliveira/standwise/commit/ce4779ed6ee4c5c9ef410ecc2a5b7470445b68d7))
* **api:** undeclared drizzle-orm import broke the production image ([f7f3b49](https://github.com/ImFelipeOliveira/standwise/commit/f7f3b497a23457b6d67ac356b6c67d118213992c))
* atomic per-daily blocker route cap and a reason line in routed DMs ([53bc229](https://github.com/ImFelipeOliveira/standwise/commit/53bc2299377c055f51d6e14ec23bb7b51e1a097e))
* blocker routing fallbacks, identity lookup and claim handling ([76f0090](https://github.com/ImFelipeOliveira/standwise/commit/76f00909a60cc52867bf1057cd700e288438a820))
* canonical install url, explicit railway start commands, safer install.sh ([48159a2](https://github.com/ImFelipeOliveira/standwise/commit/48159a266dec2833588068a1f218181f33057138))
* clamp suggestion titles in the draft and widen the suggestion leak test ([c5f87c9](https://github.com/ImFelipeOliveira/standwise/commit/c5f87c9f9824e1e973701f5536c6654d9099de08))
* clean stale slack identities on user_not_found and user_disabled only ([a4f02dc](https://github.com/ImFelipeOliveira/standwise/commit/a4f02dce4aab68a3759a196e80ebe2aa1169058a))
* **cli:** disable bunfig autoload, keep api path, no redirects ([f011518](https://github.com/ImFelipeOliveira/standwise/commit/f011518767a243c393917c2412f66b6440f9b3bd))
* **cli:** enforce https api urls, server-side logout, device flow hardening ([25af97c](https://github.com/ImFelipeOliveira/standwise/commit/25af97c8b3d2a8c4198c193f2c96a78cceb7e5ef))
* concurrent health probes share one query instead of failing ([ca39388](https://github.com/ImFelipeOliveira/standwise/commit/ca39388524dc26a9ffc574eb7f040aac8672cb83))
* **core:** directory-only codeowners patterns with repeated segments ([c4faa5c](https://github.com/ImFelipeOliveira/standwise/commit/c4faa5ca7a52d3f6278e84db400b98642d72cb24))
* **core:** linear-time codeowners matching and ownerless rules ([e4a5568](https://github.com/ImFelipeOliveira/standwise/commit/e4a55688e1b4f88e33c04609d6b2ba8129802b5a))
* **core:** reject unsafe characters and non-http schemes in ref urls ([008ad10](https://github.com/ImFelipeOliveira/standwise/commit/008ad10a244fa3615bf3db4e1a7db9fe31013a17))
* **db:** delivery claim fencing, session expiry, login uniqueness ([3b8e8fd](https://github.com/ImFelipeOliveira/standwise/commit/3b8e8fdaea6e23d1c4cc9ce31b3c05913530c95f))
* **db:** idempotent decideSuggestion and single-shot notified mark ([ec2f58b](https://github.com/ImFelipeOliveira/standwise/commit/ec2f58bde32f1d728e80deade961148c76674017))
* **db:** unforgeable placeholder for released logins ([eb83c26](https://github.com/ImFelipeOliveira/standwise/commit/eb83c26db841b209f7623c92af478ed0baade3df))
* **docs:** pt-br redirect and static headers; paginate team members ([bfec1e1](https://github.com/ImFelipeOliveira/standwise/commit/bfec1e12451f7e0a5aac413f7eb5a5afe5697db1))
* **docs:** readable text in dark mode ([bc3dfe5](https://github.com/ImFelipeOliveira/standwise/commit/bc3dfe5fd1c7ddc30577f322443058e12651d5ef))
* **docs:** readable text in dark mode ([892eb68](https://github.com/ImFelipeOliveira/standwise/commit/892eb689ffa92a3d49ac25664a0c373d92162464))
* drop the config when standwise.yml is removed ([ab19c85](https://github.com/ImFelipeOliveira/standwise/commit/ab19c85b381d6e19cabcd40443cd2510978f91fa))
* episode-scoped no-review suggestions, stately spread scans and typed github rate limits ([294abc7](https://github.com/ImFelipeOliveira/standwise/commit/294abc76da85f72cae6ca101fe8175ae5221a8e3))
* **github:** a forbidden team listing is reported as missing unless rate limited ([bc6d578](https://github.com/ImFelipeOliveira/standwise/commit/bc6d578e5d90fbeff250d440ff7fe4e2c9547a8e))
* **github:** paginate review, timeline and check-run reads; raw codeowners ([4018966](https://github.com/ImFelipeOliveira/standwise/commit/401896639a92e5274082b75d46436eccf5008a9b))
* **github:** read raw codeowners body as text regardless of content type ([570a527](https://github.com/ImFelipeOliveira/standwise/commit/570a527b8bdea9d890f3937675a72d3fa6b256f6))
* guarded slack identity writes, queued tracker linking and stale identity cleanup ([e529af8](https://github.com/ImFelipeOliveira/standwise/commit/e529af85f6c538c976f987831f475951d8a0dccb))
* hardening before the first release ([54efa42](https://github.com/ImFelipeOliveira/standwise/commit/54efa42b1142480b3f50e8bb57e7d39377519aca))
* hide suggestion deliveries from admins and resolve check suites in a job ([521c60a](https://github.com/ImFelipeOliveira/standwise/commit/521c60a5d65416f2f5c6414fce8e6d2b1f424ba7))
* install https-only, i18n elicitation, public url and api hardening ([2ca93c5](https://github.com/ImFelipeOliveira/standwise/commit/2ca93c55ae475e47dbe1edd5d2f7f21828bc035f))
* isolate setup team notices from failures and slow github ([7664cfd](https://github.com/ImFelipeOliveira/standwise/commit/7664cfd44c47e528848e47363b151465ac4fb018))
* keep last valid config when standwise.yml is invalid ([eaa7690](https://github.com/ImFelipeOliveira/standwise/commit/eaa769003b09089a2b92aa478fbf9b1d06e4e790))
* keep query for non-github hosts in ref identity, skip scan before resolving teams ([f878774](https://github.com/ImFelipeOliveira/standwise/commit/f8787743af786996479fcac3216e59183880e276))
* **linear:** bound linear calls, compare-and-swap token rotation, narrow auth errors ([b5a114a](https://github.com/ImFelipeOliveira/standwise/commit/b5a114a04d30d781f592225507164d25954980fb))
* **linear:** classify errors by type, ignore email case, order activity, cap error messages ([f4f30f6](https://github.com/ImFelipeOliveira/standwise/commit/f4f30f653600b6f5aa7b23c815f435a1f790cda4))
* **linear:** keep a valid token on refresh outages and heal the workspace key ([0508cb9](https://github.com/ImFelipeOliveira/standwise/commit/0508cb9d7e3517a40dfe213f6ee24035fe0038ed))
* **linear:** keep relink jobs, retry rate limits and never write identities across workspaces ([3047c02](https://github.com/ImFelipeOliveira/standwise/commit/3047c025b11fd5b5d61b69a4f6ecf4f5f0538fab))
* **linear:** keep the tracker factory safe and relink identities on config change ([166f4a6](https://github.com/ImFelipeOliveira/standwise/commit/166f4a6e88080dca78d9ee9d72830d54b5aae45a))
* **linear:** let linear access invalidate only the connection it used ([d9022ea](https://github.com/ImFelipeOliveira/standwise/commit/d9022ea86580a8b34f44eec8dea4925696f80b52))
* **linear:** resolve github teams when linking linear users, harden identity lookup ([716e56c](https://github.com/ImFelipeOliveira/standwise/commit/716e56cbb151fa0123928e8814760c33b72c9d67))
* **mcp:** confirm exactly what is posted, reject control chars, scope team names ([a1ba064](https://github.com/ImFelipeOliveira/standwise/commit/a1ba064d838cada16cf69b8db70d8bf11b5fd3cd))
* **mcp:** elicitation-based confirmation and untrusted data fencing ([412dad1](https://github.com/ImFelipeOliveira/standwise/commit/412dad14aca2734db518bac1bf909bd4700f29fd))
* plan 1 follow-ups (rate limit, slack 429, safe logs, data pruning, membership cache, managers validation) ([e8433f7](https://github.com/ImFelipeOliveira/standwise/commit/e8433f77b094e0aa6d7d812daff5f6e3ce5f627b))
* **plugin:** exit-code safe cli fallback and mcp error handling ([b3797e9](https://github.com/ImFelipeOliveira/standwise/commit/b3797e9b8143bb0f78286500a3cb1a5b5a689711))
* **plugin:** unindented heredoc delimiter ([4d78870](https://github.com/ImFelipeOliveira/standwise/commit/4d78870a4f5520003fec5588cc144aee7ee89a99))
* prune only resolved suggestions in batches and log unhandled api errors safely ([4e66207](https://github.com/ImFelipeOliveira/standwise/commit/4e66207f7474e2c0a9a497d6cd29c058d4db1181))
* prune person-level delivery rows after 90 days and drop unused exports ([ed221f2](https://github.com/ImFelipeOliveira/standwise/commit/ed221f299ba4fce67ace278466ab0f2fb3db402a))
* **queue:** pin in-flight singleton semantics and align memory queue ([e8548a2](https://github.com/ImFelipeOliveira/standwise/commit/e8548a20a98eaf89e65886a03a7e71583693a07f))
* reminder window, digest isolation, bulk chat ids ([927c3a7](https://github.com/ImFelipeOliveira/standwise/commit/927c3a73f59607d5a59e2b55f91f077b4cf5ae73))
* route blockers by ref identity, once per recipient set, capped at 10 per daily ([f190806](https://github.com/ImFelipeOliveira/standwise/commit/f190806674e415368672155cf8268f525fcca43d))
* **security:** cache negative membership and rate limit web routes ([4931bc1](https://github.com/ImFelipeOliveira/standwise/commit/4931bc1ec276ab64ce3968f7c2811cf12b546e4d))
* **security:** check membership by immutable github id ([36d32fe](https://github.com/ImFelipeOliveira/standwise/commit/36d32fefc27ba810ff06024fe2c946c1d9fd88d4))
* **security:** only admins connect slack ([e2d291b](https://github.com/ImFelipeOliveira/standwise/commit/e2d291bc2485786c87a4caa996a7fe8c52da243f))
* **security:** security headers on web pages ([0af3a3d](https://github.com/ImFelipeOliveira/standwise/commit/0af3a3d5cf9f20160691b81c5b66059c40d855e5))
* serialize config loads, load on every default branch push and move scan eligibility out of the webhook ([e4ce302](https://github.com/ImFelipeOliveira/standwise/commit/e4ce3026bc72e3a44707318bb8a2274985f7814b))
* setup page splits team failures from grouped person failures with translated kinds ([397a4b4](https://github.com/ImFelipeOliveira/standwise/commit/397a4b48ebfb65d0341438e4d53eeb13661a0e8b))
* **setup:** show the linear not-connected notice only without a connection ([de76aed](https://github.com/ImFelipeOliveira/standwise/commit/de76aed4ddfc6da49ec3342eda628dcb2d3b5a2a))
* **signals:** skip card sync on a truncated Linear page and log the installation ([224ec35](https://github.com/ImFelipeOliveira/standwise/commit/224ec3524b1bf4fee8ad3e8182fa2e934a6b3b76))
* skip completed daily scans, case-insensitive ref identity, concurrent draft sources ([b1427ca](https://github.com/ImFelipeOliveira/standwise/commit/b1427caaf8850b216f89909849d000b5725670db))
* skip health probes while a previous query is still running ([92a470a](https://github.com/ImFelipeOliveira/standwise/commit/92a470a3e73067b1d5716a53dc3ffd4483810930))
* **slack:** bounded retries and timeout to keep one digest per day ([7fe0184](https://github.com/ImFelipeOliveira/standwise/commit/7fe0184dbc0a337023f2099b64b88f1fcceff5c4))
* **slack:** escape untrusted text and urls, harden block limits ([aab9f0a](https://github.com/ImFelipeOliveira/standwise/commit/aab9f0a3d3baf90cbfa07f01a249b17f0683742b))
* use config slack mapping in digests and reset identities on workspace change ([2838c84](https://github.com/ImFelipeOliveira/standwise/commit/2838c84ab20eb23e0d69889c8b21da985ef2f424))
* use refreshed login within the same request ([00e7f03](https://github.com/ImFelipeOliveira/standwise/commit/00e7f03dd3a88e4b13d24b6b433b328a6e1570a5))
* web logout, bounded health check and busybox-safe installer ([e4bd32f](https://github.com/ImFelipeOliveira/standwise/commit/e4bd32f2d41f0a04fa4568945a6dec985627eacb))
* **web:** deliveries log as compact rows, header landmark, step order and dead css ([88b46f2](https://github.com/ImFelipeOliveira/standwise/commit/88b46f2253b6aeab80389b19f5a7b1a5722018c5))
* **web:** keep button colors inside alerts, add sr-only and a labelled step status ([8c754ea](https://github.com/ImFelipeOliveira/standwise/commit/8c754ea269438a6954ecd80e047a7b2a024f392d))
* **web:** organization switch button matches the select size ([1178c75](https://github.com/ImFelipeOliveira/standwise/commit/1178c759fd67a3bbfb41cd6d86637d86c4b5db65))
* **worker:** reconcile dailies submitted mid-digest and harden retries ([ce24d82](https://github.com/ImFelipeOliveira/standwise/commit/ce24d82c32174e5140a2d1d62be2eaa90de05940))
* workers poll only the queues each job uses and pg-boss errors log safe fields ([2dc7605](https://github.com/ImFelipeOliveira/standwise/commit/2dc7605e0dbc7b80661f98bde2d2478db5f24a9b))


### Performance

* cache resolved teams per installation ([5f3f1de](https://github.com/ImFelipeOliveira/standwise/commit/5f3f1dee8e5e69ebfe4097282e14d918e52af23d))


### Documentation

* add hardening implementation plan ([d9845d0](https://github.com/ImFelipeOliveira/standwise/commit/d9845d0ec94cad35ecc7c4418f15135dd45ef9d0))
* add layering rule (use cases in orchestrator, thin routes) ([f56cf51](https://github.com/ImFelipeOliveira/standwise/commit/f56cf5187f7d3e93b186f5a3b24f1e1a4b8182b5))
* add linear implementation plan ([669f571](https://github.com/ImFelipeOliveira/standwise/commit/669f571c8e074c79cd03adc6764a40112a6961c3))
* add manager read tools to the mcp server ([7789493](https://github.com/ImFelipeOliveira/standwise/commit/77894935cec6f598bbd0723c2d319ab70de9c1d5))
* add monetization direction for agents ([8f2d6f3](https://github.com/ImFelipeOliveira/standwise/commit/8f2d6f34bbffbe143980da81efaa0064a8d980f5))
* add orchestration implementation plan ([b0e45fe](https://github.com/ImFelipeOliveira/standwise/commit/b0e45fe314e376d28414a649fb4b964635119254))
* add public api, outbound webhooks and mcp to spec and plan 1 ([3531ae1](https://github.com/ImFelipeOliveira/standwise/commit/3531ae19c0c38a28e390cee28f8b42cc997d54f4))
* add Standwise design draft ([4a44183](https://github.com/ImFelipeOliveira/standwise/commit/4a441832dac6dc0a1d0100f263cc0c8b460b6c27))
* add Standwise plan 1 (foundation) and pin config location and email permission ([905b5b9](https://github.com/ImFelipeOliveira/standwise/commit/905b5b9ec0d46eff2c48038dc0b266d7d82e9a13))
* add thin-slice phase 0 and hosted-only v1 ([6444ed0](https://github.com/ImFelipeOliveira/standwise/commit/6444ed08a1096429004a94576c8ad65fc34b9ac4))
* add ui implementation plan ([32b5744](https://github.com/ImFelipeOliveira/standwise/commit/32b574451d3cb331c2e01a8d45f529118fc3b532))
* admin-only slack and keep-last-valid config ([26a0e42](https://github.com/ImFelipeOliveira/standwise/commit/26a0e428b15f5c25d6e622a2207866a70936797b))
* card suggestions are checked only by the daily scan ([369b334](https://github.com/ImFelipeOliveira/standwise/commit/369b334558b26d6aa90885cea0e149cf7b798ec7))
* cloudflare pages setup, DOCS_URL and the docs domain ([4adf0a3](https://github.com/ImFelipeOliveira/standwise/commit/4adf0a3831c097c4ca9a3a3ff8ee3d66c077cf76))
* complete documentation site with overview, guides and api reference ([76d7c96](https://github.com/ImFelipeOliveira/standwise/commit/76d7c96ebd9ed708263526f92967e25af2163f60))
* defer component library decision to phase 2 ([f764c1f](https://github.com/ImFelipeOliveira/standwise/commit/f764c1f70eb34886151300910e21881348c0276c))
* drop deadline-driven phase 0 ([94cf3d3](https://github.com/ImFelipeOliveira/standwise/commit/94cf3d3c8e436e1af95e10724ea9904d29db33f5))
* english is the default language when none is set ([8f8bd54](https://github.com/ImFelipeOliveira/standwise/commit/8f8bd5425ef6df6a97d3a22d9d41052f80eacfec))
* final-domain checklist includes the published install url check ([86cdebe](https://github.com/ImFelipeOliveira/standwise/commit/86cdebe7c17cf5e3230671f508f7784e869840d1))
* hosting is Felipe-only, no self-host ([23d67b6](https://github.com/ImFelipeOliveira/standwise/commit/23d67b605f5a691dcd56c6bd1cb22108a35d96bc))
* keep agent write routes internal; agents use mcp or skill ([01da3b3](https://github.com/ImFelipeOliveira/standwise/commit/01da3b38ef8e528d2497d83f2732131908ccc15c))
* landing page lists shipped orchestration features ([6d9a54e](https://github.com/ImFelipeOliveira/standwise/commit/6d9a54efee2f26794af3cfd4be11334af0697f81))
* linear integration ([f189604](https://github.com/ImFelipeOliveira/standwise/commit/f189604747fbb8c49ba291a8c2fbc758e6299218))
* linear troubleshooting points at the stopped-working message and privacy lists routing reads ([87472ae](https://github.com/ImFelipeOliveira/standwise/commit/87472aeb1c7303b512fb80744766b83995652dee))
* llm key is per organization ([5bd1c64](https://github.com/ImFelipeOliveira/standwise/commit/5bd1c6466ae68db3e3e141b96a662fecfebd5832))
* mcp converses in the user's language and never translates dailies ([c9dba39](https://github.com/ImFelipeOliveira/standwise/commit/c9dba391c4b157203c815ac33f1fed535c998edf))
* no_route_target meaning, routing identity and cap, review episodes, person delivery retention ([d66384b](https://github.com/ImFelipeOliveira/standwise/commit/d66384b07346fad04808ea40c8d761bf9a58c5a3))
* plan a complete documentation site with product overview ([605a608](https://github.com/ImFelipeOliveira/standwise/commit/605a6089ed02b6c465562e99c00a0ed0f67d7165))
* plan phase 2 org-level AI analysis with byok ([c42a981](https://github.com/ImFelipeOliveira/standwise/commit/c42a9818b6f5cb4e0550b3b6b971a7147b093dad))
* plugin bundles the mcp server with the /daily skill ([f6e8cd8](https://github.com/ImFelipeOliveira/standwise/commit/f6e8cd817fe47f0e8636c88b29ef731643e20dc8))
* point readers at the interim api domain and list every place to change for the final one ([1138cc3](https://github.com/ImFelipeOliveira/standwise/commit/1138cc3e2c5a8e147ae7b786a7f3919b3cf0169f))
* readme roadmap and features for reminders, routing, suggestions and check runs ([2fc6311](https://github.com/ImFelipeOliveira/standwise/commit/2fc6311455a82719e3d403ef0ef93c6fcd5c39c8))
* redesign README ([49644ff](https://github.com/ImFelipeOliveira/standwise/commit/49644ffb388a5882505887ecae4a4a6c96c8196c))
* redesign README with badges, diagram and roadmap ([cbd8a8c](https://github.com/ImFelipeOliveira/standwise/commit/cbd8a8ce6ebec6d2bcbb13c2a3ee796f1ef8f696))
* reminders, blocker routing, suggested blockers and config check runs ([aa39224](https://github.com/ImFelipeOliveira/standwise/commit/aa392248429f210de4de18aadecfb41165a51acd))
* remove phase 0, build 1a at author's pace ([9331e47](https://github.com/ImFelipeOliveira/standwise/commit/9331e4772396e06afd9fd4cb4b27b3bbf6a395c8))
* resolve builder-check questions in Standwise design ([96fa24d](https://github.com/ImFelipeOliveira/standwise/commit/96fa24d482bda597bdfaf8ffc68123a7fe6627a8))
* single api replica, deploying without a domain, hardening notes ([92670cc](https://github.com/ImFelipeOliveira/standwise/commit/92670ccfa26048f9ab60681d4bc0813d285a9b10))
* **site:** setup errors table, edit link on invalid files, deliveries list ([c88c9bb](https://github.com/ImFelipeOliveira/standwise/commit/c88c9bbf6c33876c142978c06260ce8f107fdab9))


### Refactoring

* **cli:** one shared default api url resolver for the cli and its build ([15ef983](https://github.com/ImFelipeOliveira/standwise/commit/15ef983fef6b66b300e4b76a87807ea5a9f190b8))
* move business rules into orchestrator use cases ([151bb01](https://github.com/ImFelipeOliveira/standwise/commit/151bb0131a96f27d44407a4b1ae10015d78e75d3))
* **web:** compact admin lists and setup polish ([cdae865](https://github.com/ImFelipeOliveira/standwise/commit/cdae865edcc32301567225984a96a6eff5949dbc))
