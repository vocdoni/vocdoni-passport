import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, spacing, typography } from './styles';

interface FlowStepIndicatorProps {
  steps: string[];
  activeStep: number;
  completedSteps?: number;
  showLabels?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function FlowStepIndicator({
  steps,
  activeStep,
  completedSteps = activeStep - 1,
  showLabels = true,
  containerStyle,
}: FlowStepIndicatorProps) {
  return (
    <View style={containerStyle}>
      <View style={styles.indicator}>
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber <= completedSteps;
          const isActive = stepNumber === activeStep && !isCompleted;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={label}>
              <View style={[styles.step, isCompleted && styles.stepCompleted, isActive && styles.stepActive]}>
                <Text style={styles.stepText}>{isCompleted ? '✓' : stepNumber}</Text>
              </View>
              {!isLast && (
                <View style={[styles.stepLine, stepNumber < activeStep && styles.stepLineActive]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {showLabels && (
        <View style={styles.labels}>
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isHighlighted = stepNumber === activeStep || stepNumber <= completedSteps;
            return (
              <Text key={label} style={[styles.label, isHighlighted && styles.labelActive]}>
                {label}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepActive: {
    backgroundColor: colors.primary,
  },
  stepCompleted: {
    backgroundColor: colors.success,
  },
  stepText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  stepLineActive: {
    backgroundColor: colors.success,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.primary,
  },
});
