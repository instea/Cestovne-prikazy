node {
    sh 'sh bin/build.sh'
    sh 'cp bin/deploy.sh /opt/cestaky/bin'
    dir('/opt/cestaky/src') {
        sh 'rm -rf server build public'
    }
    sh 'cp -t /opt/cestaky/src server build public'
    
    dir('/opt/cestaky/src') {
        sh 'sh /opt/cestaky/bin/deploy.sh'
    }
}
