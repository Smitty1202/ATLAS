using System.Text.Json;
using System.Text.RegularExpressions;
using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Engine;
using CUE4Parse.UE4.Assets.Objects;
using CUE4Parse.UE4.Objects.Core.Math;
using CUE4Parse.UE4.Objects.UObject;
using CUE4Parse.UE4.Versions;

namespace PalBossKeys;

static class Program
{
    const string BossTablePath = "Pal/Content/Pal/DataTable/UI/DT_BossSpawnerLoactionData";

    static int Main(string[] args)
    {
        try
        {
            var repoRoot = FindRepoRoot();
            var paksDir = Arg(args, "--paks") ?? Environment.GetEnvironmentVariable("PALCALC_PALWORLD_PAKS");
            if (string.IsNullOrWhiteSpace(paksDir))
                throw new InvalidOperationException("Palworld Paks path required. Pass --paks <path> or set PALCALC_PALWORLD_PAKS.");

            paksDir = Path.GetFullPath(paksDir);
            if (!Directory.Exists(paksDir)) throw new DirectoryNotFoundException(paksDir);

            var usmapPath = Environment.GetEnvironmentVariable("PALCALC_MAPPINGS_USMAP")
                ?? Path.Combine(repoRoot, "tools", "pal-extract", "Mappings.usmap");
            usmapPath = Path.GetFullPath(usmapPath);
            if (!File.Exists(usmapPath))
                throw new FileNotFoundException("Mappings.usmap not found. Set PALCALC_MAPPINGS_USMAP if it lives elsewhere.", usmapPath);

            var outPath = Environment.GetEnvironmentVariable("ATLAS_FIELD_BOSS_KEYS_OUT")
                ?? Path.Combine(repoRoot, "app", "public", "map", "field-boss-keys.json");
            outPath = Path.GetFullPath(outPath);

            OodleHelper.DownloadOodleDll();
            OodleHelper.Initialize();

            var provider = new DefaultFileProvider(
                paksDir,
                SearchOption.AllDirectories,
                true,
                new VersionContainer(EGame.GAME_UE5_1));
            provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmapPath);
            provider.Initialize();
            provider.Mount();
            provider.LoadVirtualPaths();

            var table = provider.LoadPackageObject<UDataTable>(BossTablePath);
            var bosses = new List<(string species, string key, double x, double y, int level)>();
            var skipped = 0;

            foreach (var row in table.RowMap)
            {
                var values = Values(row.Value);
                var species = StringValue(values, "CharacterID");
                if (string.IsNullOrWhiteSpace(species) || species.Equals("None", StringComparison.OrdinalIgnoreCase))
                {
                    skipped++;
                    continue;
                }

                var key = StringValue(values, "SpawnerID");
                if (string.IsNullOrWhiteSpace(key) || key.Equals("None", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException($"Field boss {species} has no SpawnerID (row {row.Key.Text}).");

                var loc = row.Value.GetOrDefault<FVector>("Location");
                bosses.Add((species, key, loc.X, loc.Y, IntValue(values, "Level")));
            }

            var ordered = bosses
                .OrderBy(b => b.species, StringComparer.Ordinal)
                .ThenBy(b => b.key, StringComparer.Ordinal)
                .ThenBy(b => b.x)
                .ThenBy(b => b.y)
                .Select(b => new
                {
                    species = b.species,
                    key = b.key,
                    x = Math.Round(b.x, 3),
                    y = Math.Round(b.y, 3),
                    level = b.level,
                })
                .ToArray();

            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            var payload = new
            {
                game_build = ResolveGameBuild(paksDir),
                total = ordered.Length,
                bosses = ordered,
            };
            File.WriteAllText(outPath, JsonSerializer.Serialize(payload));

            Console.WriteLine($"[field-boss-keys] table rows={table.RowMap.Count} bosses={ordered.Length} skippedNonPal={skipped}");
            Console.WriteLine($"[field-boss-keys] game build={payload.game_build}");
            Console.WriteLine($"[field-boss-keys] wrote {outPath}");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[field-boss-keys] ERROR: {ex.Message}");
            return 1;
        }
    }

    static string? Arg(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    static string FindRepoRoot()
    {
        foreach (var start in new[] { Environment.CurrentDirectory, AppContext.BaseDirectory })
        {
            var dir = new DirectoryInfo(Path.GetFullPath(start));
            while (dir != null)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "app")) &&
                    Directory.Exists(Path.Combine(dir.FullName, "tools")))
                    return dir.FullName;
                dir = dir.Parent;
            }
        }
        throw new DirectoryNotFoundException("ATLAS repository root not found.");
    }

    static Dictionary<string, object> Values(FStructFallback row)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in row.Properties) result[p.Name.Text] = p.Tag?.GenericValue;
        return result;
    }

    static string? StringValue(Dictionary<string, object> values, string name)
    {
        if (!values.TryGetValue(name, out var value) || value == null) return null;
        return value is FName fn ? fn.Text : value.ToString();
    }

    static int IntValue(Dictionary<string, object> values, string name) =>
        values.TryGetValue(name, out var value) && value != null ? Convert.ToInt32(value) : 0;

    static string ResolveGameBuild(string paksDir)
    {
        var dir = new DirectoryInfo(paksDir);
        while (dir != null)
        {
            if (dir.Name.Equals("steamapps", StringComparison.OrdinalIgnoreCase))
            {
                var manifest = Path.Combine(dir.FullName, "appmanifest_1623730.acf");
                if (!File.Exists(manifest)) return "unknown";
                var text = File.ReadAllText(manifest);
                var match = Regex.Match(text, "\\\"buildid\\\"\\s*\\\"(?<id>\\d+)\\\"", RegexOptions.IgnoreCase);
                return match.Success ? match.Groups["id"].Value : "unknown";
            }
            dir = dir.Parent;
        }
        return "unknown";
    }
}
