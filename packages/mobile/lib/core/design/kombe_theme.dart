import 'package:flutter/material.dart';

import 'kombe_colors.dart';
import 'kombe_spacing.dart';
import 'kombe_tokens.g.dart';

/// Phrase expressive (une seule par titre, règle de la charte) : Newsreader
/// italique. Le reste de l'interface reste en Manrope.
abstract final class KombeType {
  static TextStyle accent({double size = 28, Color color = KombeColors.goldDark, double height = 1.05}) => TextStyle(
        fontFamily: KombeTokens.fontDisplay,
        fontStyle: FontStyle.italic,
        fontWeight: FontWeight.w500,
        fontSize: size,
        height: height,
        letterSpacing: -.2,
        color: color,
      );
}

abstract final class KombeTheme {
  static ThemeData light() {
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: KombeColors.forest,
      brightness: Brightness.light,
      primary: KombeColors.forest,
      secondary: KombeColors.gold,
      surface: KombeColors.cream,
      error: KombeColors.danger,
    );

    final ThemeData base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: KombeColors.cream,
      visualDensity: VisualDensity.standard,
      splashFactory: InkSparkle.splashFactory,
      // Identité v2 : Manrope partout (sans quoi Android retombe sur Roboto).
      fontFamily: KombeTokens.fontUi,
      // Mouvement de marque : les écrans glissent et se fondent (Android) ;
      // iOS garde sa transition native. Réduit si le système coupe les animations.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: <TargetPlatform, PageTransitionsBuilder>{
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        },
      ),
    );

    return base.copyWith(
      textTheme: base.textTheme.copyWith(
        displaySmall: base.textTheme.displaySmall?.copyWith(
          color: KombeColors.ink,
          fontWeight: FontWeight.w800,
          height: 1.06,
        ),
        headlineLarge: base.textTheme.headlineLarge?.copyWith(
          color: KombeColors.ink,
          fontWeight: FontWeight.w800,
        ),
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          color: KombeColors.ink,
          fontWeight: FontWeight.w800,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          color: KombeColors.ink,
          fontWeight: FontWeight.w800,
        ),
        titleMedium: base.textTheme.titleMedium?.copyWith(
          color: KombeColors.ink,
          fontWeight: FontWeight.w700,
        ),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(
          color: KombeColors.ink,
          height: 1.42,
        ),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(
          color: KombeColors.slate,
          height: 1.42,
        ),
        labelLarge: base.textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: KombeColors.cream,
        foregroundColor: KombeColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.72),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.forest, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.danger),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white.withValues(alpha: 0.76),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.cardRadius),
          side: const BorderSide(color: KombeColors.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(KombeSpacing.minTouch),
          backgroundColor: KombeColors.forest,
          foregroundColor: KombeColors.cream,
          shape: const StadiumBorder(),
          textStyle: const TextStyle(fontFamily: KombeTokens.fontUi, fontSize: 16, fontWeight: FontWeight.w800),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(KombeSpacing.minTouch),
          foregroundColor: KombeColors.forest,
          side: const BorderSide(color: KombeColors.forest),
          shape: const StadiumBorder(),
          textStyle: const TextStyle(fontFamily: KombeTokens.fontUi, fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 74,
        backgroundColor: Colors.white,
        indicatorColor: KombeColors.mint,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => TextStyle(
            fontFamily: KombeTokens.fontUi,
            color: states.contains(WidgetState.selected)
                ? KombeColors.forest
                : KombeColors.slate,
            fontSize: 11,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w800
                : FontWeight.w500,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(color: KombeColors.line, thickness: 1),
    );
  }
}
