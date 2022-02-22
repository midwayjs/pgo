#!/bin/bash

echo "origin command line: $*"

run () {
    java_path=$1
    suffix="/bin/java"
    if [[ "$java_path" != *"$suffix" ]]; then
        echo "can not detect JAVA_HOME, run directly"
        exec "$@"
        exit $?
    else
        echo "detected JAVA_HOME: ${java_path%$suffix}"
    fi

    release_file="${java_path%$suffix}/release"
    if [ ! -f "$release_file" ]; then
        echo "$release_file does not exist."
        exec "$@"
        exit $?
    fi

    if ! grep -q 'IMPLEMENTOR="Alibaba"' "$release_file"; then
        echo "current java release is not Alibaba Dragonwell, run directly"
        exec "$@"
        exit $?
    else
        echo "current java release is Alibaba Dragonwell"
    fi

    if [[ -z "${SRPATH}" ]]; then
      echo "env var SRPATH should be set"
      exit 1
    else
      srpath="${SRPATH}"
    fi

    if [ -d "$srpath" ]
    then
        echo "Directory $srpath exists"
    else
        if mkdir -p $srpath; then
            echo "dir $srpath created"
        else
            echo "dir $srpath creating encountered error"
            exit 1
        fi
    fi

    args=()
    i=1;
    j=$#;
    while [ $i -le $j ]
    do
        current=$i
        i=$((i + 1));
        item=$1
        shift 1;

        if [[ $item == "-Xquickstart"* ]] ;
        then
            continue
        fi

        args+=( "$item" )

        if [[ $current == 1 ]] ;
        then
            args+=( "-Xquickstart:verbose,path=$srpath" )
            args+=( "-XX:+IgnoreAppCDSDirCheck" )
            args+=( "-Xbootclasspath/a:/code/sr" )
            args+=( "-Xlog:class+eagerappcds=trace:file=/tmp/classloader.log" )
        fi

    done

    echo "final command line: ${args[*]}"
    exec "${args[@]}"
}

dump () {
    java_home=$1
    jcmd="$1/bin/jcmd"
    pid=$2

    if [ ! -d "$java_home" ]
    then
        echo "invalid JAVA_HOME [$java_home]"
        exit 1
    fi

    if [ ! -f "$jcmd" ]; then
        echo "jcmd [$jcmd] does not exist"
        exit 1
    fi

    echo "run command line: $jcmd $pid QuickStart.dump"
    exec "$jcmd" "$pid" QuickStart.dump
}

save () {
    if ! command -v "tar" &> /dev/null
    then
        echo "tar could not be found"
        exit 1
    fi
    srpath=$1
    zip_file_path=$2

    if [ ! -d "$srpath" ]
    then
        echo "srpath [$srpath] does not exist, the bootstrap_wrapper may not take effect"
        exit 1
    fi

    cd "$srpath"
    echo "tar -czf $zip_file_path ."
    exec tar -czf $zip_file_path .
}

mode=$1

case "$mode" in
    'dump')
        if [[ $# -lt 3 ]]; then
            echo "arguments not enough, required 3 but got $#"
            exit 1
        fi
        dump "$2" "$3"
        ;;
    'save')
        if [[ $# -lt 3 ]]; then
            echo "arguments not enough, required 3 but got $#"
            exit 1
        fi
        save "$2" "$3"
        ;;
    *)
        run "$@"
        ;;
esac

exit 0
