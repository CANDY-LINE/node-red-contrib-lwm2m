{
  'includes': [
    'common-wakaama.gypi'
  ],
  'variables': {
    'deps_dir': '.',
  },
  'targets': [
    {
      'target_name': 'liblwm2mclient',
      'type': 'static_library',
      'include_dirs': [
        '<(wakaama_core_dir)/er-coap-13',
        '<(wakaama_core_dir)',
      ],
      'cflags': [
      ],
      'sources': [
        '<@(wakaama_core_sources)',
      ],
      'cflags_cc': [
          '-Wno-unused-value',
      ],
      'defines': [
        '<@(wakaama_defines)',
        'LWM2M_CLIENT_MODE',
      ],
    },
    {
      'target_name': 'libtinydtls',
      'type': 'static_library',
      'include_dirs': [
        '<(wakaama_dtls_dir)/aes',
        '<(wakaama_dtls_dir)/ecc',
        '<(wakaama_dtls_dir)/sha2',
        '<(wakaama_dtls_dir)',
        './tinydtls',
      ],
      'dependencies': [
        'liblwm2mclient',
      ],
      'cflags': [
      ],
      'sources': [
        '<@(wakaama_dtls_sources)',
      ],
      'cflags_cc': [
          '-Wno-unused-value',
      ],
      'defines': [
        '<@(wakaama_defines)',
      ],
    },
    {
      'target_name': 'liblwm2mshared',
      'type': 'static_library',
      'include_dirs': [
        '<(wakaama_core_dir)',
        '<(wakaama_shared_dir)',
        '<(deps_dir)/tinydtls',
        '<(deps_dir)',
      ],
      'dependencies': [
        'liblwm2mclient',
        'libtinydtls',
      ],
      'cflags': [
      ],
      'sources': [
        '<@(wakaama_shared_sources)',
      ],
      'cflags_cc': [
          '-Wno-unused-value',
      ],
      'defines': [
        '<@(wakaama_defines)',
      ],
    },
  ]
}
