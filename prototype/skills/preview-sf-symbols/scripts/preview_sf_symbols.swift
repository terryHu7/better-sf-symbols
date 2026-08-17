#!/usr/bin/env swift

import AppKit
import Foundation

private struct Options {
    var outputDirectory = "work/sf-symbol-previews/latest"
    var manifestPath: String?
    var weight = "regular"
    var color = "#000000"
    var pointSize = 48.0
    var canvasSize = 128
}

private struct Occurrence: Codable {
    let line: Int
    let source: String
    let fragment: String
}

private struct ExtractedCandidate {
    let name: String
    var occurrences: [Occurrence]
}

private struct RenderedSymbol: Codable {
    let name: String
    let imagePath: String
    let imageMarkdown: String
    let swiftuiCode: String
    let styledSwiftuiCode: String
    let occurrences: [Occurrence]
}

private struct RejectedSymbol: Codable {
    let name: String
    let reason: String
    let occurrences: [Occurrence]
}

private struct Style: Codable {
    let weight: String
    let color: String
    let pointSize: Double
    let canvasSize: Int
    let background: String
}

private struct SourceSummary: Codable {
    let lineCount: Int
    let candidateCount: Int
    let extractionPolicy: String
}

private struct RendererSummary: Codable {
    let api: String
    let platform: String
}

private struct Manifest: Codable {
    let schemaVersion: String
    let renderer: RendererSummary
    let source: SourceSummary
    let style: Style
    let symbols: [RenderedSymbol]
    let rejected: [RejectedSymbol]
}

private enum PreviewError: Error, CustomStringConvertible {
    case usage(String)
    case runtime(String)

    var description: String {
        switch self {
        case .usage(let message), .runtime(let message):
            return message
        }
    }
}

private let usage = """
Usage: preview_sf_symbols.swift [options] < raw-ai-reply.txt

Options:
  --output-dir PATH   PNG output directory (default: work/sf-symbol-previews/latest)
  --manifest PATH     Also write the JSON manifest to PATH
  --weight NAME       ultralight|thin|light|regular|medium|semibold|bold|heavy|black
  --color HEX         #RGB, #RRGGBB, or #RRGGBBAA (default: #000000)
  --point-size NUMBER Symbol point size (default: 48)
  --canvas-size INT   Square transparent PNG size in pixels (default: 128)
  --help              Show this help
"""

private func parseOptions(_ arguments: [String]) throws -> Options {
    var options = Options()
    var index = 0

    func requiredValue(after flag: String) throws -> String {
        guard index + 1 < arguments.count else {
            throw PreviewError.usage("Missing value after \(flag).\n\n\(usage)")
        }
        index += 1
        return arguments[index]
    }

    while index < arguments.count {
        let argument = arguments[index]
        switch argument {
        case "--output-dir":
            options.outputDirectory = try requiredValue(after: argument)
        case "--manifest":
            options.manifestPath = try requiredValue(after: argument)
        case "--weight":
            options.weight = try requiredValue(after: argument).lowercased()
        case "--color":
            options.color = try requiredValue(after: argument).uppercased()
        case "--point-size":
            let value = try requiredValue(after: argument)
            guard let number = Double(value), number > 0, number <= 512 else {
                throw PreviewError.usage("Invalid --point-size: \(value)")
            }
            options.pointSize = number
        case "--canvas-size":
            let value = try requiredValue(after: argument)
            guard let number = Int(value), number >= 32, number <= 2048 else {
                throw PreviewError.usage("Invalid --canvas-size: \(value)")
            }
            options.canvasSize = number
        case "--help", "-h":
            print(usage)
            exit(EXIT_SUCCESS)
        default:
            throw PreviewError.usage("Unknown argument: \(argument)\n\n\(usage)")
        }
        index += 1
    }

    if options.weight == "ultra-light" { options.weight = "ultralight" }
    if options.weight == "semi-bold" { options.weight = "semibold" }
    return options
}

private func regex(_ pattern: String, options: NSRegularExpression.Options = []) -> NSRegularExpression {
    // These patterns are constants; failing fast here is preferable to a partial manifest.
    return try! NSRegularExpression(pattern: pattern, options: options)
}

private let bulletPattern = regex(#"^\s*(?:[-*+•‣▪]|\d+[.)])\s+(.+)$"#)
private let headSeparatorPattern = regex(#"\s+(?:—|–|-|:|：)\s*"#)
private let leadingNamePattern = regex(#"^[a-z0-9]+(?:\.[a-z0-9]+)*"#)
private let dottedReferencePattern = regex(#"(?<![A-Za-z0-9_.])[a-z0-9]+(?:\.[a-z0-9]+)+(?![A-Za-z0-9_.])"#)

private func firstMatch(_ expression: NSRegularExpression, in value: String) -> NSTextCheckingResult? {
    expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value))
}

private func matchedText(_ match: NSTextCheckingResult, group: Int = 0, in value: String) -> String? {
    guard let range = Range(match.range(at: group), in: value) else { return nil }
    return String(value[range])
}

private func cleanBulletHead(_ value: String) -> String {
    let fullRange = NSRange(value.startIndex..., in: value)
    let separator = headSeparatorPattern.firstMatch(in: value, range: fullRange)
    let prefix: String
    if let separator, let range = Range(separator.range, in: value) {
        prefix = String(value[..<range.lowerBound])
    } else {
        prefix = value
    }

    return prefix
        .replacingOccurrences(of: "`", with: "")
        .replacingOccurrences(of: "*", with: "")
        .replacingOccurrences(of: "_", with: "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

private func namesAtBulletHead(_ value: String) -> [String] {
    var remainder = cleanBulletHead(value)
    var names: [String] = []

    while !remainder.isEmpty {
        remainder = remainder.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let match = firstMatch(leadingNamePattern, in: remainder),
              let name = matchedText(match, in: remainder),
              let nameRange = Range(match.range, in: remainder) else {
            break
        }

        names.append(name)
        remainder = String(remainder[nameRange.upperBound...])
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let separators = ["/", "／", ",", "，", "、"]
        if let separator = separators.first(where: { remainder.hasPrefix($0) }) {
            remainder.removeFirst(separator.count)
            continue
        }

        if remainder.hasPrefix("or ") {
            remainder.removeFirst(3)
            continue
        }
        break
    }

    return names
}

private func dottedReferences(in line: String) -> [String] {
    let matches = dottedReferencePattern.matches(
        in: line,
        range: NSRange(line.startIndex..., in: line)
    )
    return matches.compactMap { matchedText($0, in: line) }
}

private func extractCandidates(from input: String) -> ([ExtractedCandidate], Int) {
    let lines = input.components(separatedBy: .newlines)
    var order: [String] = []
    var occurrencesByName: [String: [Occurrence]] = [:]
    var seenOccurrences = Set<String>()

    func add(_ name: String, source: String, lineNumber: Int, fragment: String) {
        let occurrenceKey = "\(name)\u{1F}\(lineNumber)"
        guard !seenOccurrences.contains(occurrenceKey) else { return }
        seenOccurrences.insert(occurrenceKey)
        if occurrencesByName[name] == nil { order.append(name) }
        occurrencesByName[name, default: []].append(
            Occurrence(line: lineNumber, source: source, fragment: fragment)
        )
    }

    for (offset, line) in lines.enumerated() {
        let lineNumber = offset + 1
        var namesFromHead = Set<String>()

        if let bullet = firstMatch(bulletPattern, in: line),
           let payload = matchedText(bullet, group: 1, in: line) {
            for name in namesAtBulletHead(payload) {
                namesFromHead.insert(name)
                add(name, source: "bullet_head", lineNumber: lineNumber, fragment: line)
            }
        }

        for name in dottedReferences(in: line) where !namesFromHead.contains(name) {
            add(name, source: "context_reference", lineNumber: lineNumber, fragment: line)
        }
    }

    let candidates = order.compactMap { name -> ExtractedCandidate? in
        guard let occurrences = occurrencesByName[name] else { return nil }
        return ExtractedCandidate(name: name, occurrences: occurrences)
    }
    return (candidates, lines.count)
}

private func fontWeight(named name: String) throws -> NSFont.Weight {
    switch name {
    case "ultralight", "ultra-light": return .ultraLight
    case "thin": return .thin
    case "light": return .light
    case "regular": return .regular
    case "medium": return .medium
    case "semibold", "semi-bold": return .semibold
    case "bold": return .bold
    case "heavy": return .heavy
    case "black": return .black
    default:
        throw PreviewError.usage("Unsupported weight: \(name)")
    }
}

private func color(from hex: String) throws -> (color: NSColor, normalized: String, rgba: (Double, Double, Double, Double)) {
    var digits = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if digits.hasPrefix("#") { digits.removeFirst() }

    if digits.count == 3 {
        digits = digits.map { "\($0)\($0)" }.joined()
    }
    guard digits.count == 6 || digits.count == 8,
          digits.allSatisfy({ $0.isHexDigit }),
          let raw = UInt64(digits, radix: 16) else {
        throw PreviewError.usage("Invalid --color: \(hex). Use #RGB, #RRGGBB, or #RRGGBBAA.")
    }

    let hasAlpha = digits.count == 8
    let red = Double((raw >> (hasAlpha ? 24 : 16)) & 0xFF) / 255.0
    let green = Double((raw >> (hasAlpha ? 16 : 8)) & 0xFF) / 255.0
    let blue = Double((raw >> (hasAlpha ? 8 : 0)) & 0xFF) / 255.0
    let alpha = hasAlpha ? Double(raw & 0xFF) / 255.0 : 1.0
    let normalized = "#" + digits.uppercased()
    return (
        NSColor(srgbRed: red, green: green, blue: blue, alpha: alpha),
        normalized,
        (red, green, blue, alpha)
    )
}

private func render(
    symbol: NSImage,
    name: String,
    outputURL: URL,
    pointSize: Double,
    canvasSize: Int,
    weight: NSFont.Weight,
    color: NSColor
) throws {
    let sizeConfiguration = NSImage.SymbolConfiguration(
        pointSize: CGFloat(pointSize),
        weight: weight
    )
    let colorConfiguration = NSImage.SymbolConfiguration(paletteColors: [color])
    let configuration = sizeConfiguration.applying(colorConfiguration)
    guard let configured = symbol.withSymbolConfiguration(configuration) else {
        throw PreviewError.runtime("AppKit could not configure \(name)")
    }

    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: canvasSize,
        pixelsHigh: canvasSize,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        throw PreviewError.runtime("Could not allocate bitmap for \(name)")
    }

    bitmap.size = NSSize(width: canvasSize, height: canvasSize)
    guard let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw PreviewError.runtime("Could not create graphics context for \(name)")
    }

    NSGraphicsContext.saveGraphicsState()
    defer { NSGraphicsContext.restoreGraphicsState() }
    NSGraphicsContext.current = graphics
    graphics.cgContext.clear(CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))
    graphics.imageInterpolation = .high

    let sourceSize = configured.size
    let maximumDimension = CGFloat(canvasSize) * 0.82
    let safeWidth = max(sourceSize.width, 1)
    let safeHeight = max(sourceSize.height, 1)
    let scale = min(1, maximumDimension / max(safeWidth, safeHeight))
    let drawSize = NSSize(width: safeWidth * scale, height: safeHeight * scale)
    let drawRect = NSRect(
        x: (CGFloat(canvasSize) - drawSize.width) / 2,
        y: (CGFloat(canvasSize) - drawSize.height) / 2,
        width: drawSize.width,
        height: drawSize.height
    )
    configured.draw(in: drawRect, from: .zero, operation: .sourceOver, fraction: 1)
    graphics.flushGraphics()

    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        throw PreviewError.runtime("Could not encode PNG for \(name)")
    }
    try png.write(to: outputURL, options: .atomic)
}

private func safeFilename(_ name: String) -> String {
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789.-_")
    return name.unicodeScalars.map { allowed.contains($0) ? String($0) : "_" }.joined()
}

private func formatted(_ value: Double) -> String {
    String(format: "%.4f", value)
}

private func styledSwiftUICode(
    name: String,
    pointSize: Double,
    weight: String,
    rgba: (Double, Double, Double, Double)
) -> String {
    let size = pointSize.rounded() == pointSize ? String(Int(pointSize)) : String(pointSize)
    let swiftUIWeight = weight == "ultralight" ? "ultraLight" : weight
    let color: String
    if rgba.3 < 1 {
        color = "Color(red: \(formatted(rgba.0)), green: \(formatted(rgba.1)), blue: \(formatted(rgba.2)), opacity: \(formatted(rgba.3)))"
    } else {
        color = "Color(red: \(formatted(rgba.0)), green: \(formatted(rgba.1)), blue: \(formatted(rgba.2)))"
    }
    return """
    Image(systemName: "\(name)")
        .font(.system(size: \(size), weight: .\(swiftUIWeight)))
        .foregroundStyle(\(color))
    """
}

private func writeManifest(_ data: Data, to path: String) throws {
    let url = URL(fileURLWithPath: path).standardizedFileURL
    try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    try data.write(to: url, options: .atomic)
}

private func run() throws {
    let options = try parseOptions(Array(CommandLine.arguments.dropFirst()))
    let inputData = FileHandle.standardInput.readDataToEndOfFile()
    guard let input = String(data: inputData, encoding: .utf8), !input.isEmpty else {
        throw PreviewError.usage("Expected the raw AI reply on standard input. Do not ask the user to reformat it.")
    }

    let weight = try fontWeight(named: options.weight)
    let parsedColor = try color(from: options.color)
    let (candidates, lineCount) = extractCandidates(from: input)
    let outputDirectory = URL(fileURLWithPath: options.outputDirectory).standardizedFileURL
    try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

    var symbols: [RenderedSymbol] = []
    var rejected: [RejectedSymbol] = []

    for candidate in candidates {
        guard let systemImage = NSImage(
            systemSymbolName: candidate.name,
            accessibilityDescription: candidate.name
        ) else {
            rejected.append(
                RejectedSymbol(
                    name: candidate.name,
                    reason: "NSImage(systemSymbolName:) returned nil on this Mac",
                    occurrences: candidate.occurrences
                )
            )
            continue
        }

        let filename = "\(safeFilename(candidate.name))__\(options.weight).png"
        let imageURL = outputDirectory.appendingPathComponent(filename)
        try render(
            symbol: systemImage,
            name: candidate.name,
            outputURL: imageURL,
            pointSize: options.pointSize,
            canvasSize: options.canvasSize,
            weight: weight,
            color: parsedColor.color
        )

        symbols.append(
            RenderedSymbol(
                name: candidate.name,
                imagePath: imageURL.path,
                imageMarkdown: "![\(candidate.name)](\(imageURL.path))",
                swiftuiCode: "Image(systemName: \"\(candidate.name)\")",
                styledSwiftuiCode: styledSwiftUICode(
                    name: candidate.name,
                    pointSize: options.pointSize,
                    weight: options.weight,
                    rgba: parsedColor.rgba
                ),
                occurrences: candidate.occurrences
            )
        )
    }

    let manifest = Manifest(
        schemaVersion: "preview-sf-symbols/v1",
        renderer: RendererSummary(
            api: "AppKit.NSImage(systemSymbolName:accessibilityDescription:)",
            platform: ProcessInfo.processInfo.operatingSystemVersionString
        ),
        source: SourceSummary(
            lineCount: lineCount,
            candidateCount: candidates.count,
            extractionPolicy: "bullet_heads_and_dotted_context_references"
        ),
        style: Style(
            weight: options.weight,
            color: parsedColor.normalized,
            pointSize: options.pointSize,
            canvasSize: options.canvasSize,
            background: "transparent"
        ),
        symbols: symbols,
        rejected: rejected
    )

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    encoder.keyEncodingStrategy = .convertToSnakeCase
    let data = try encoder.encode(manifest)

    if let manifestPath = options.manifestPath {
        try writeManifest(data, to: manifestPath)
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("preview-sf-symbols: \(error)\n".utf8))
    exit(EXIT_FAILURE)
}
