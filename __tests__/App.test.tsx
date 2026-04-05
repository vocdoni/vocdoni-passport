/**
 * Smoke test for the Jest + React Native test harness.
 * Full <App /> is not mounted here: it depends on native modules and Reanimated
 * that are not available in the Node test environment. Use E2E or device tests
 * for integration coverage.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';
import renderer from 'react-test-renderer';
import { it } from '@jest/globals';

it('renders a minimal React Native tree', () => {
  const tree = renderer.create(
    <View>
      <Text>Vocdoni Passport</Text>
    </View>,
  );
  expect(tree.toJSON()).toBeTruthy();
});
