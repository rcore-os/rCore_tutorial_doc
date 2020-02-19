Prism.languages.riscv = {
    'comment': /#.*\n/,

    'general-registers' : {
        pattern: /\b(?:x[1-2]?[0-9]|x30|x31|zero|ra|sp|gp|tp|fp|t[0-6]|s[0-9]|s1[0-1]|a[0-7]|pc)\b/,
        alias: 'class-name'
    },
    's-mode-csrs' : {
        pattern: /\bs(?:status|tvec|ip|ie|counteren|scratch|epc|cause|tval|atp|)\b/,
        alias: 'class-name'
    },

    /* timer & monitor csrs are not included yet */
    'm-mode-csrs' : {
        pattern: /\bm(?:isa|vendorid|archid|hardid|status|tvec|ideleg|ip|ie|counteren|scratch|epc|cause|tval)\b/,
        alias: 'class-name'
    },


    'rv32/64i-instructions': {
        pattern: /\b(?:(addi?w?)|(slti?u?)|(?:and|or|xor)i?|(?:sll|srl|sra)i?w?|lui|auipc|subw?|jal|jalr|beq|bne|bltu?|bgeu?|s[bhwd]|(l[bhw]u?)|ld)\b/,
        alias: 'keyword'
    },
    'csr-instructions': {
        pattern:  /\b(?:csrr?[rws]i?)\b/,
        alias: 'keyword'
    },
    'privilege-instructions': {
        pattern: /\b(?:ecall|ebreak|[msu]ret|wfi|sfence.vma)\b/,
	alias: 'keyword'
    },
    'pseudo-instructions': {
        pattern: /\b(?:nop|li|la|mv|not|neg|negw|sext.w|seqz|snez|sltz|sgtz|f(?:mv|abs|neg).(?:s|d)|b(?:eq|ne|le|ge|lt)z|bgt|ble|bgtu|bleu|j|jr|ret|call)\b/,
        alias: 'important'
    },

    'relocation-functions': {
        pattern: /(?:%hi|%lo|%pcrel_hi|%pcrel_lo|%tprel_(?:hi|lo|add))/,
        alias: 'important'
    },

    /* 'function': /function/, */

    'operator': /operator/,
    'data-emitting-directives': {
        pattern: /(?:.2byte|.4byte|.8byte|.quad|.half|.word|.dword|.byte|.dtpreldword|.dtprelword|.sleb128|.uleb128|.asciz|.string|.incbin|.zero)/,
        alias: 'tag'
    },
    'alignment-directives': {
        pattern: /(?:.align|.balign|.p2align)/,
        alias: 'tag'
    },
    'symbol-directives': {
        pattern: /(?:.globl|.local|.equ)/,
        alias: 'tag'
    },
    'section-directives': {
        pattern: /(?:.text|.data|.rodata|.bss|.comm|.common|.section)/,
        alias: 'tag'
    },
    'miscellaneous-directives': {
        pattern: /(?:.option|.macro|.endm|.file|.ident|.size|.type)/,
        alias: 'tag'
    },

    'labels': {
        pattern: /\S*:/,
        alias: 'operator'
    },
    'number': /\b(?:(?:0x|)[\da-f]+|(?:0o|)[0-7]+|\d+)\b/,
    'last-literals': {
        pattern: /\b\S*\b/,
        alias: 'operator',
    },

};
