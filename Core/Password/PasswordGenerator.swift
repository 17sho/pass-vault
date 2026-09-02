import Foundation
import Security

public enum PasswordGeneratorError: Error, Equatable { case invalidLength, noCharacterClasses, randomGenerationFailed }

public struct PasswordGeneratorOptions: Equatable, Sendable {
    public var length: Int
    public var uppercase: Bool
    public var lowercase: Bool
    public var digits: Bool
    public var symbols: Bool

    public init(length: Int = 20, uppercase: Bool = true, lowercase: Bool = true, digits: Bool = true, symbols: Bool = true) {
        self.length = length; self.uppercase = uppercase; self.lowercase = lowercase; self.digits = digits; self.symbols = symbols
    }
}

public enum PasswordGenerator {
    public static let symbols = Array("!@#$%^&*()-_=+[]{}:,.?")
    private static let uppercase = Array("ABCDEFGHJKLMNPQRSTUVWXYZ")
    private static let lowercase = Array("abcdefghijkmnopqrstuvwxyz")
    private static let digits = Array("23456789")

    public static func generate(options: PasswordGeneratorOptions = .init()) throws -> String {
        let selected: [[Character]] = [options.uppercase ? uppercase : [], options.lowercase ? lowercase : [], options.digits ? digits : [], options.symbols ? symbols : []].filter { !$0.isEmpty }
        guard !selected.isEmpty else { throw PasswordGeneratorError.noCharacterClasses }
        guard (12...64).contains(options.length), options.length >= selected.count else { throw PasswordGeneratorError.invalidLength }
        let all = selected.flatMap { $0 }
        var result = try selected.map { try randomElement(from: $0) }
        while result.count < options.length { result.append(try randomElement(from: all)) }
        for index in result.indices.reversed() {
            let other = try randomIndex(upperBound: index + 1)
            result.swapAt(index, other)
        }
        return String(result)
    }

    private static func randomElement(from characters: [Character]) throws -> Character {
        characters[try randomIndex(upperBound: characters.count)]
    }

    private static func randomIndex(upperBound: Int) throws -> Int {
        guard upperBound > 0, upperBound <= 256 else { throw PasswordGeneratorError.invalidLength }
        let limit = 256 - (256 % upperBound)
        while true {
            var byte: UInt8 = 0
            guard SecRandomCopyBytes(kSecRandomDefault, 1, &byte) == errSecSuccess else { throw PasswordGeneratorError.randomGenerationFailed }
            if Int(byte) < limit { return Int(byte) % upperBound }
        }
    }
}
