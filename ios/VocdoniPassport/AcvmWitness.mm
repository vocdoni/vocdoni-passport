#import "AcvmWitness.h"
#import "acvm_witness_ffi.h"
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@implementation AcvmWitness

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(solveFromFile : (NSString *)path resolver : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSError *err = nil;
    NSString *json = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&err];
    if (!json) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"E_READ", err.localizedDescription ?: @"read payload", err);
      });
      return;
    }
    [self solvePayloadJson:json resolver:resolve rejecter:reject];
  });
}

RCT_EXPORT_METHOD(solveFromJson : (NSString *)json resolver : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    [self solvePayloadJson:json resolver:resolve rejecter:reject];
  });
}

- (void)solvePayloadJson:(NSString *)json resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
  NSData *jdata = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (jdata.length == 0) {
    dispatch_async(dispatch_get_main_queue(), ^{
      reject(@"E_READ", @"empty witness payload", nil);
    });
    return;
  }

  AcvmWitnessFfiResult r =
      acvm_witness_solve_json_utf8((const uint8_t *)jdata.bytes, jdata.length);

  if (r.status != 0) {
    NSString *msg = r.error_utf8 ? [NSString stringWithUTF8String:r.error_utf8] : @"ACVM error";
    acvm_witness_free_ffi_result(r);
    dispatch_async(dispatch_get_main_queue(), ^{
      reject(@"E_ACVM", msg, nil);
    });
    return;
  }

  if (r.data.ptr == NULL || r.data.len == 0) {
    acvm_witness_free_ffi_result(r);
    dispatch_async(dispatch_get_main_queue(), ^{
      reject(@"E_ACVM", @"empty witness output", nil);
    });
    return;
  }

  NSData *out = [NSData dataWithBytes:r.data.ptr length:r.data.len];
  acvm_witness_free_ffi_result(r);
  NSString *b64 = [out base64EncodedStringWithOptions:0];

  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(b64);
  });
}

@end
