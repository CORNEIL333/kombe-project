import 'package:flutter/material.dart';

import 'kombe_colors.dart';
import 'kombe_spacing.dart';
import 'kombe_tokens.g.dart';

/// Typographie : Manrope partout ; titres en ExtraBold à approche serrée,
/// accent olive (maquette « Connectez-vous »). `titre` : style d'un grand titre ;
/// `accent` : la partie mise en valeur d'un titre (olive, même graisse).
abstract final class KombeType {
  static TextStyle titre({double size = 32, Color color = KombeColors.forest, double height = 1.08, FontWeight weight = FontWeight.w800}) => TextStyle(
        fontFamily: KombeTokens.fontUi,
        fontWeight: weight,
        fontSize: size,
        height: height,
        letterSpacing: -size * .032,
        color: color,
      );
  static TextStyle accent({double size = 28, Color color = KombeColors.olive, double height = 1.08}) => titre(size: size, color: color, height: height);
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
        // Titres en Manrope ExtraBold, approche serrée (maquette « Connectez-vous »).
        displaySmall: base.textTheme.displaySmall?.copyWith(
          fontFamily: KombeTokens.fontDisplay,
          color: KombeColors.forest,
          fontWeight: FontWeight.w800,
          height: 1.0,
          letterSpacing: -1.2,
        ),
        headlineLarge: base.textTheme.headlineLarge?.copyWith(
          fontFamily: KombeTokens.fontDisplay,
          color: KombeColors.forest,
          fontWeight: FontWeight.w800,
          letterSpacing: -.5,
        ),
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          fontFamily: KombeTokens.fontDisplay,
          color: KombeColors.forest,
          fontWeight: FontWeight.w800,
          letterSpacing: -.5,
        ),
        headlineSmall: base.textTheme.headlineSmall?.copyWith(
          fontFamily: KombeTokens.fontDisplay,
          color: KombeColors.forest,
          fontWeight: FontWeight.w800,
          letterSpacing: -.5,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontFamily: KombeTokens.fontDisplay,
          color: KombeColors.forest,
          fontWeight: FontWeight.w800,
          letterSpacing: -.5,
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
