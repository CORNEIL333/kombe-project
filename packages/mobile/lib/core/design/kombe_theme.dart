import 'package:flutter/material.dart';

import 'kombe_colors.dart';
import 'kombe_spacing.dart';
import 'kombe_tokens.g.dart';

/// Thème KÓMBE — couche C (produit) : Manrope partout, Fraunces réservée aux
/// moments d'affichage (display*), hiérarchie par le contraste (taille,
/// graisse, couleur) plutôt que par des 800 généralisés. Chiffres tabulaires
/// sur les styles qui portent des montants.
abstract final class KombeTheme {
  static const List<FontFeature> _tabular = <FontFeature>[FontFeature.tabularFigures()];

  static TextStyle _ui(double size, double line, FontWeight w, {Color color = KombeColors.ink, double tracking = 0}) =>
      TextStyle(
        fontFamily: KombeTokens.fontUi,
        fontSize: size,
        height: line / size,
        fontWeight: w,
        color: color,
        letterSpacing: tracking * size,
      );

  static TextStyle _display(double size, double line) => TextStyle(
        fontFamily: KombeTokens.fontDisplay,
        fontSize: size,
        height: line / size,
        fontWeight: FontWeight.w500,
        color: KombeColors.forest,
        letterSpacing: -0.03 * size,
      );

  static TextTheme textTheme() => TextTheme(
        displayLarge: _display(56, 56),
        displayMedium: _display(48, 48),
        displaySmall: _display(40, 42),
        headlineLarge: _ui(32, 38, FontWeight.w700, tracking: -.02),
        headlineMedium: _ui(28, 34, FontWeight.w700, tracking: -.02).copyWith(fontFeatures: _tabular),
        headlineSmall: _ui(24, 30, FontWeight.w700, tracking: -.015).copyWith(fontFeatures: _tabular),
        titleLarge: _ui(20, 26, FontWeight.w700, tracking: -.01),
        titleMedium: _ui(16, 22, FontWeight.w700),
        titleSmall: _ui(14, 20, FontWeight.w700),
        bodyLarge: _ui(16, 24, FontWeight.w400),
        bodyMedium: _ui(14, 20, FontWeight.w400, color: KombeColors.slate),
        bodySmall: _ui(13, 18, FontWeight.w500, color: KombeColors.slate),
        labelLarge: _ui(15, 20, FontWeight.w700),
        labelMedium: _ui(12, 16, FontWeight.w700, color: KombeColors.slate, tracking: .02),
        labelSmall: _ui(11, 14, FontWeight.w700, color: KombeColors.slate, tracking: .16),
      );

  static ThemeData light() {
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: KombeColors.forest,
      brightness: Brightness.light,
      primary: KombeColors.forest,
      onPrimary: KombeColors.cream,
      secondary: KombeColors.emerald,
      tertiary: KombeColors.gold,
      surface: KombeColors.cream,
      onSurface: KombeColors.ink,
      onSurfaceVariant: KombeColors.slate,
      outline: KombeColors.lineStrong,
      outlineVariant: KombeColors.line,
      error: KombeColors.danger,
    );
    final TextTheme text = textTheme();

    final ThemeData base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: KombeTokens.fontUi,
      textTheme: text,
      scaffoldBackgroundColor: KombeColors.cream,
      visualDensity: VisualDensity.standard,
      // Ondulation sobre : pas d'InkSparkle (bruit visuel, coût GPU sur entrée de gamme).
      splashFactory: InkRipple.splashFactory,
    );

    final RoundedRectangleBorder buttonShape =
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(KombeTokens.radiusMd));
    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: KombeColors.cream,
        foregroundColor: KombeColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: text.bodyMedium,
        floatingLabelStyle: text.labelMedium?.copyWith(color: KombeColors.emerald),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.lineStrong, width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.lineStrong, width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.emerald, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
          borderSide: const BorderSide(color: KombeColors.danger, width: 1.5),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.cardRadius),
          side: const BorderSide(color: KombeColors.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(KombeSpacing.minTouch + 4),
          backgroundColor: KombeColors.forest,
          foregroundColor: KombeColors.cream,
          disabledBackgroundColor: KombeColors.sand,
          disabledForegroundColor: KombeColors.slate,
          shape: buttonShape,
          textStyle: text.labelLarge,
          animationDuration: KombeMotion.fast,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(KombeSpacing.minTouch + 4),
          foregroundColor: KombeColors.forest,
          side: const BorderSide(color: KombeColors.lineStrong, width: 1.5),
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: KombeColors.emerald,
          textStyle: text.labelLarge,
          minimumSize: const Size(48, 48),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 72,
        elevation: 0,
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        indicatorColor: KombeColors.mint,
        iconTheme: WidgetStateProperty.resolveWith(
          (Set<WidgetState> s) =>
              IconThemeData(color: s.contains(WidgetState.selected) ? KombeColors.forest : KombeColors.slate),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => TextStyle(
            fontFamily: KombeTokens.fontUi,
            color: states.contains(WidgetState.selected) ? KombeColors.forest : KombeColors.slate,
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w600,
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: KombeColors.ink,
        contentTextStyle: text.bodyMedium?.copyWith(color: KombeColors.cream),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(KombeTokens.radiusMd)),
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: KombeColors.emerald, linearTrackColor: KombeColors.line),
      dividerTheme: const DividerThemeData(color: KombeColors.line, thickness: 1, space: 1),
      listTileTheme: ListTileThemeData(
        titleTextStyle: text.titleSmall,
        subtitleTextStyle: text.bodySmall,
        minVerticalPadding: 12,
      ),
    );
  }
}
