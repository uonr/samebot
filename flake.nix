{
  description = "A birdge between Cytube and Telegram.";

  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell { buildInputs = with pkgs; [ nodejs ]; };
        packages.samebot = pkgs.buildNpmPackage rec {
          name = "samebot";
          pname = name;
          src = pkgs.lib.sources.cleanSource ./.;
          dontNpmBuild = true;
          npmDepsHash = "sha256-uBmmDdVe8bUjkyRrP/6PrD89zmQt3iLypPv82cqVQVI=";
          installPhase = ''
            mkdir -p $out
            cp package.json $out/
            cp -r node_modules $out/
            cp index.ts $out/
          '';
        };
      }
    );
}
