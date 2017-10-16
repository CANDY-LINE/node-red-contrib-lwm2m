{
  'variables': {
    'module_name%': 'node_lwm2m',
    'module_path%': 'build',
    'deps_dir': './deps',
    'src_dir': './src',
    'client_dir': '<(src_dir)/client',
  },
  'includes': [
    'deps/common.gypi'
  ],
  'targets': [
    {
      'target_name': '<(module_name)',
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
        '<(wakaama_core_dir)',
        '<(wakaama_shared_dir)',
        '<(deps_dir)/tinydtls',
        '<(deps_dir)',
        '<(client_dir)',
        '<(src_dir)',
      ],
      'dependencies': [
        '<(deps_dir)/wakaama.gyp:liblwm2mclient',
        '<(deps_dir)/wakaama.gyp:liblwm2mshared',
        '<(deps_dir)/wakaama.gyp:libtinydtls',
        '<(deps_dir)/wakaama.gyp:lwm2mclientcoreobj',
      ],
      'cflags': [
      ],
      'sources': [
        '<(src_dir)/node_lwm2m.cc',
      ],
      'cflags_cc': [
      ],
      'defines': [
        '<@(wakaama_defines)',
        'LWM2M_CLIENT_MODE',
      ],
    },
    {
      'target_name': 'lwm2mclient',
      'type': 'executable',
      'include_dirs': [
        '<(wakaama_core_dir)',
        '<(wakaama_shared_dir)',
        '<(deps_dir)/tinydtls',
        '<(deps_dir)',
        '<(client_dir)',
        '<(src_dir)',
        '<(base64_dir)',
      ],
      'dependencies': [
        '<(deps_dir)/wakaama.gyp:libbase64',
        '<(deps_dir)/wakaama.gyp:liblwm2mclient',
        '<(deps_dir)/wakaama.gyp:liblwm2mshared',
        '<(deps_dir)/wakaama.gyp:libtinydtls',
        '<(deps_dir)/wakaama.gyp:lwm2mclientcoreobj',
      ],
      'cflags': [
      ],
      'sources': [
        '<(client_dir)/lwm2mclient.c',
        '<(client_dir)/object_generic.c',
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
      'target_name': 'action_after_build',
      'type': 'none',
      'dependencies': [
        '<(module_name)',
        'lwm2mclient',
      ],
      'copies': [
        {
          'files': [
            '<(PRODUCT_DIR)/<(module_name).node',
            '<(PRODUCT_DIR)/lwm2mclient'
          ],
          'destination': '<(module_path)'
        }
      ]
    }
  ]
}
