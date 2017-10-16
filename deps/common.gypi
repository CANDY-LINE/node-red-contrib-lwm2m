{
  'variables': {
    'base64_dir': '<(deps_dir)/base64',
    'tinydtls_dir': '<(deps_dir)/tinydtls',
    'wakaama_dtls_dir':
    '<(deps_dir)/wakaama/examples/shared/tinydtls',
    'wakaama_dtls_sources': [
      '<(wakaama_dtls_dir)/ccm.c',
      '<(wakaama_dtls_dir)/crypto.c',
      '<(wakaama_dtls_dir)/dtls_debug.c',
      '<(wakaama_dtls_dir)/dtls_time.c',
      '<(wakaama_dtls_dir)/dtls.c',
      '<(wakaama_dtls_dir)/hmac.c',
      '<(wakaama_dtls_dir)/netq.c',
      '<(wakaama_dtls_dir)/peer.c',
      '<(wakaama_dtls_dir)/session.c',
      '<(wakaama_dtls_dir)/sha2/sha2.c',
      '<(wakaama_dtls_dir)/aes/rijndael.c',
      '<(wakaama_dtls_dir)/ecc/ecc.c',
    ],
    'wakaama_core_dir': '<(deps_dir)/wakaama/core',
    'wakaama_core_sources': [
      '<(wakaama_core_dir)/er-coap-13/er-coap-13.c',

      '<(wakaama_core_dir)/block1.c',
      '<(wakaama_core_dir)/bootstrap.c',
      '<(wakaama_core_dir)/data.c',
      '<(wakaama_core_dir)/discover.c',
      '<(wakaama_core_dir)/json.c',
      '<(wakaama_core_dir)/liblwm2m.c',
      '<(wakaama_core_dir)/list.c',
      '<(wakaama_core_dir)/management.c',
      '<(wakaama_core_dir)/objects.c',
      '<(wakaama_core_dir)/observe.c',
      '<(wakaama_core_dir)/packet.c',
      '<(wakaama_core_dir)/registration.c',
      '<(wakaama_core_dir)/tlv.c',
      '<(wakaama_core_dir)/transaction.c',
      '<(wakaama_core_dir)/uri.c',
      '<(wakaama_core_dir)/utils.c',
    ],
    'wakaama_example_dir': '<(deps_dir)/wakaama/examples',
    'wakaama_client_dir': '<(wakaama_example_dir)/client',
    'wakaama_clientcoreobj_sources': [
      '<(wakaama_client_dir)/object_security.c',
      '<(wakaama_client_dir)/object_server.c',
    ],
    'wakaama_shared_dir': '<(wakaama_example_dir)/shared',
    'wakaama_shared_sources': [
      '<(wakaama_shared_dir)/commandline.c',
      # '<(wakaama_shared_dir)/connection.c',  # Plain Connection
      '<(wakaama_shared_dir)/dtlsconnection.c',  # DTLS Connection
      '<(wakaama_shared_dir)/memtrace.c',
      '<(wakaama_shared_dir)/platform.c',
    ],
    'wakaama_defines': [
      'LWM2M_BOOTSTRAP',
      'LWM2M_SUPPORT_JSON',
      'LWM2M_LITTLE_ENDIAN=<!(python <(deps_dir)/endianess.py)',
      'WITH_TINYDTLS',
      'DTLSv12',
      'WITH_SHA256',
      'DTLS_PSK',
      'DTLS_ECC',
    ],
  },
  'target_defaults': {
    'default_configuration': 'Release',
    'configurations': {
      'Debug': {
        'defines': [
          'LWM2M_WITH_LOGS',
          'WITH_LOGS',
        ],
        'cflags_cc!': [
          '-O3',
          '-Os',
        ],
        'cflags_cc': [
          '-std=c++11',
          '-stdlib=libc++',
        ],
        'xcode_settings': {
          'MACOSX_DEPLOYMENT_TARGET': '10.7',
          'OTHER_CPLUSPLUSFLAGS!': [
            '-O3',
            '-Os',
            '-DDEBUG'
          ],
          'OTHER_CPLUSPLUSFLAGS': [
            '-std=c++11',
            '-stdlib=libc++',
          ],
          'GCC_OPTIMIZATION_LEVEL': '0',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'YES',
          'GCC_ENABLE_CPP_RTTI': 'YES',
          'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
          'MACOSX_DEPLOYMENT_TARGET': '10.9',
          'CLANG_CXX_LIBRARY': 'libc++',
          'CLANG_CXX_LANGUAGE_STANDARD': 'c++11',
          'GCC_VERSION': 'com.apple.compilers.llvm.clang.1_0',
        },
      },
      'Release': {
        'defines!': [
          'LWM2M_WITH_LOGS',
          'WITH_LOGS',
        ],
        'cflags_cc!': [
          '-DLWM2M_WITH_LOGS',
          '-DWITH_LOGS',
        ],
        'cflags_cc': [
          '-std=c++11',
          '-stdlib=libc++',
        ],
        'xcode_settings': {
          'OTHER_CPLUSPLUSFLAGS!': [
            '-Os',
            '-O2'
          ],
          'OTHER_CPLUSPLUSFLAGS': [
            '-std=c++11',
            '-stdlib=libc++',
          ],
          'GCC_OPTIMIZATION_LEVEL': '3',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'NO',
          'GCC_ENABLE_CPP_RTTI': 'YES',
          'DEAD_CODE_STRIPPING': 'YES',
          'GCC_INLINES_ARE_PRIVATE_EXTERN': 'YES',
          'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
          'MACOSX_DEPLOYMENT_TARGET': '10.9',
          'CLANG_CXX_LIBRARY': 'libc++',
          'CLANG_CXX_LANGUAGE_STANDARD': 'c++11',
          'GCC_VERSION': 'com.apple.compilers.llvm.clang.1_0',
        },
      }
    }
  }
}
